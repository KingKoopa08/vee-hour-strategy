const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = 3020;
const WS_PORT = 3008;
const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';

// WebSocket for frontend
const wss = new WebSocketServer({ port: WS_PORT });
const clients = new Set();

// Tracking
const priceHistory = new Map(); // symbol -> [{price, volume, timestamp}]
const activeSpikes = new Map();
const completedSpikes = [];
const detectedToday = new Set(); // Track symbols we've already detected today
let stats = { detected: 0, bestGain: 0 };

// Configuration - ADJUSTABLE SPIKE DETECTION
let config = {
    maxPrice: 100,
    minVolumeBurst: 1.5, // Default: 1.5x volume surge (need real surge)
    minPriceChange: 0.5, // Default: 0.5% change (need real movement)
    minVolume: 50000, // Default: 50k volume (need ACTIVE trading)
    checkInterval: 2000, // Check every 2 seconds
    historyDuration: 120000, // Keep 2 minutes of history
    spikeDetectionWindow: 60000 // Default: Look for spikes in last 60 seconds
};

// Broadcast to clients
function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(message);
        }
    });
}

// Get top active stocks
async function getActiveStocks() {
    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            // Filter for liquid stocks under max price - ONLY POSITIVE MOVERS
            return response.data.tickers
                .filter(t => {
                    const price = t.day?.c || t.min?.c || t.prevDay?.c || 0;
                    const volume = t.day?.v || t.min?.av || 0;
                    // Include ALL stocks under max price - we'll filter by volume later
                    // This ensures we catch ANY stock that suddenly spikes
                    // Lower the minimum price to catch penny stocks too
                    return price > 0.01 && price < config.maxPrice &&
                           volume > 100; // Very low threshold to catch all active stocks
                })
                .sort((a, b) => {
                    const volA = a.day?.v || a.min?.av || 0;
                    const volB = b.day?.v || b.min?.av || 0;
                    return volB - volA;
                })
                .slice(0, 5000) // Monitor ALL stocks (up to 5000)
                .map(t => ({
                    symbol: t.ticker,
                    price: t.day?.c || t.min?.c || t.prevDay?.c || 0,
                    volume: t.day?.v || t.min?.av || 0,
                    changePercent: t.todaysChangePerc || 0,
                    updated: t.updated || Date.now()
                }));
        }
    } catch (error) {
        console.error('Error fetching stocks:', error.message);
    }
    return [];
}

// Store price point
function storePricePoint(symbol, price, volume) {
    if (!priceHistory.has(symbol)) {
        priceHistory.set(symbol, []);
    }

    const history = priceHistory.get(symbol);
    const now = Date.now();

    history.push({ price, volume, timestamp: now });

    // Remove old entries
    const cutoff = now - config.historyDuration;
    while (history.length > 0 && history[0].timestamp < cutoff) {
        history.shift();
    }
}

// Detect spike - look for RECENT rapid movement with volume
function detectSpike(symbol, currentData) {
    const history = priceHistory.get(symbol);
    if (!history || history.length < 2) return null; // Only need 2 points

    const now = Date.now();

    // Get the oldest price point we have (up to 60 seconds ago)
    const oldestRelevant = now - config.spikeDetectionWindow;
    const relevantHistory = history.filter(h => h.timestamp > oldestRelevant);

    if (relevantHistory.length < 2) return null; // Reduced requirement

    // IMPORTANT: Only detect RISING stocks
    // Compare current price to EARLIER prices (not looking for lowest)
    // We want stocks rising from 30-60 seconds ago to NOW

    // Get price from 30-60 seconds ago as baseline
    const baselineTime = now - 45000; // 45 seconds ago
    let baselinePrice = null;
    let closestTimeDiff = Infinity;

    // Find price closest to 45 seconds ago
    for (const h of relevantHistory) {
        const timeDiff = Math.abs(h.timestamp - baselineTime);
        if (timeDiff < closestTimeDiff) {
            closestTimeDiff = timeDiff;
            baselinePrice = h.price;
        }
    }

    // If no baseline, use oldest available price
    if (!baselinePrice && relevantHistory.length > 0) {
        baselinePrice = relevantHistory[0].price;
    }

    // Calculate price change from baseline to current
    const priceChangeFromBaseline = baselinePrice ? ((currentData.price - baselinePrice) / baselinePrice) * 100 : 0;

    // IMPROVED VOLUME SURGE DETECTION
    // Compare RECENT volume (last 20 seconds) to PREVIOUS volume (20-60 seconds ago)
    const recentCutoff = now - 20000; // Last 20 seconds
    const recentHistory = relevantHistory.filter(h => h.timestamp > recentCutoff);
    const olderHistory = relevantHistory.filter(h => h.timestamp <= recentCutoff);

    let volumeRatio = 1.0;

    if (recentHistory.length > 0 && olderHistory.length > 0) {
        // Calculate average volume for recent vs older periods
        const recentAvgVolume = recentHistory.reduce((sum, h) => sum + h.volume, 0) / recentHistory.length;
        const olderAvgVolume = olderHistory.reduce((sum, h) => sum + h.volume, 0) / olderHistory.length;

        // Compare recent volume to older volume (this shows if volume is SURGING now)
        if (olderAvgVolume > 0) {
            volumeRatio = recentAvgVolume / olderAvgVolume;
        }

        // Also check if current volume is higher than recent average
        const currentVolumeRatio = currentData.volume / recentAvgVolume;

        // Use the higher of the two ratios (more sensitive to volume surges)
        volumeRatio = Math.max(volumeRatio, currentVolumeRatio);
    }

    // Check for RECENT price movement (must be rising in last 20 seconds)
    let recentPriceChange = 0;
    if (recentHistory.length > 0) {
        const oldestRecentPrice = recentHistory[0].price;
        recentPriceChange = ((currentData.price - oldestRecentPrice) / oldestRecentPrice) * 100;
    }

    // Check if this is a real spike:
    // 1. Price MUST BE RISING from baseline (45 seconds ago)
    // 2. Price is CURRENTLY rising (positive movement in last 20 seconds)
    // 3. Has decent volume
    // 4. Volume is surging compared to previous period
    if (priceChangeFromBaseline >= config.minPriceChange && // Must be UP from baseline
        priceChangeFromBaseline > 0 && // MUST be positive (no falling stocks!)
        recentPriceChange > 0 && // Must STILL be rising NOW
        currentData.volume > config.minVolume &&
        volumeRatio >= config.minVolumeBurst) { // Must have volume surge

        return {
            symbol,
            startPrice: baselinePrice,
            currentPrice: currentData.price,
            priceChange: priceChangeFromLow,
            volumeBurst: volumeRatio,
            volume: currentData.volume,
            startTime: relevantHistory[lowestIndex].timestamp,
            highPrice: currentData.price,
            momentum: 'SPIKING'
        };
    }

    return null;
}

// Track debug info
let checkCount = 0;
let topMovers = [];

// Check for spikes
async function checkForSpikes() {
    try {
        const stocks = await getActiveStocks();
        checkCount++;

        // Log every 5 checks
        if (checkCount % 5 === 0) {
            console.log(`✓ Scan #${checkCount}: Monitoring ${stocks.length} stocks, ${priceHistory.size} with history`);
        }

        // Log top movers every 10 checks
        if (checkCount % 10 === 0) {
            topMovers = stocks
                .filter(s => Math.abs(s.changePercent) > 1)
                .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
                .slice(0, 5);

            if (topMovers.length > 0) {
                console.log(`\n📈 Top movers:`);
                topMovers.forEach(s => {
                    console.log(`  ${s.symbol}: ${s.changePercent > 0 ? '+' : ''}${s.changePercent.toFixed(2)}% | Vol: ${(s.volume/1000000).toFixed(1)}M`);
                });
            }
        }

        for (const stock of stocks) {
            // Store price point
            storePricePoint(stock.symbol, stock.price, stock.volume);

            // Check for spike - ONLY real-time spikes, not daily gainers
            const spike = detectSpike(stock.symbol, stock);

            // Skip high momentum check - we only want stocks actively rising NOW
            // const isHighMomentum = stock.changePercent > 5 && stock.volume > 1000000;

            if (spike && !activeSpikes.has(stock.symbol) && !detectedToday.has(stock.symbol)) {
                // Use the spike data directly
                activeSpikes.set(stock.symbol, spike);
                detectedToday.add(stock.symbol); // Mark as detected
                stats.detected++;

                const timeSinceStart = ((Date.now() - spike.startTime) / 1000).toFixed(0);
                console.log(`\n🚨 REAL-TIME SPIKE DETECTED!`);
                console.log(`   Symbol: ${spike.symbol}`);
                console.log(`   Move: +${spike.priceChange.toFixed(2)}% in ${timeSinceStart}s`);
                console.log(`   Price: $${spike.startPrice.toFixed(2)} → $${spike.currentPrice.toFixed(2)}`);
                console.log(`   Volume: ${(spike.volume/1000000).toFixed(1)}M (${spike.volumeBurst.toFixed(1)}x normal)\n`);

                broadcast({
                    type: 'spike',
                    data: {
                        ...spike,
                        highPrice: spike.highPrice || spike.currentPrice,
                        momentum: 'ACCELERATING',
                        duration: 0,
                        previousChange: spike.priceChange
                    }
                });
            } else if (activeSpikes.has(stock.symbol)) {
                // Update existing spike
                const spike = activeSpikes.get(stock.symbol);
                spike.currentPrice = stock.price;
                spike.priceChange = ((stock.price - spike.startPrice) / spike.startPrice) * 100;
                spike.duration = (Date.now() - spike.startTime) / 1000;
                if (!spike.highPrice) spike.highPrice = spike.currentPrice;
                spike.highPrice = Math.max(spike.highPrice, spike.currentPrice);

                // Determine momentum based on recent price action
                const momentum = spike.priceChange > spike.previousChange ? 'ACCELERATING' :
                                spike.priceChange < 0 ? 'REVERSING' :
                                spike.priceChange < spike.previousChange ? 'SLOWING' : 'RISING';
                spike.momentum = momentum;
                spike.previousChange = spike.priceChange;

                // Check if spike is ending (price reversal or momentum completely lost)
                // Keep tracking as long as it's still positive and moving
                if (spike.priceChange < 0 || // Price went negative (reversal)
                    (spike.priceChange < 0.1 && spike.momentum === 'REVERSING')) { // Almost flat and reversing

                    activeSpikes.delete(stock.symbol);
                    completedSpikes.unshift(spike);
                    if (completedSpikes.length > 20) completedSpikes.pop();

                    if (spike.priceChange > stats.bestGain) {
                        stats.bestGain = spike.priceChange;
                    }

                    broadcast({
                        type: 'spikeComplete',
                        data: spike
                    });
                } else {
                    broadcast({
                        type: 'spikeUpdate',
                        data: spike
                    });
                }
            }
        }
    } catch (error) {
        console.error('Check error:', error.message);
    }
}

// API endpoints
app.get('/api/spikes/active', (req, res) => {
    res.json({
        success: true,
        spikes: Array.from(activeSpikes.values()),
        count: activeSpikes.size
    });
});

app.get('/api/spikes/completed', (req, res) => {
    res.json({
        success: true,
        spikes: completedSpikes,
        count: completedSpikes.length
    });
});

app.get('/api/spikes/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            spikesDetected: stats.detected,
            bestSpike: { priceChange: stats.bestGain },
            activeNow: activeSpikes.size
        }
    });
});

// GET current configuration
app.get('/api/spikes/config', (req, res) => {
    res.json({
        success: true,
        config: config
    });
});

// UPDATE configuration
app.post('/api/spikes/config', (req, res) => {
    const updates = req.body;

    // Update each provided parameter
    if (updates.maxPrice !== undefined) config.maxPrice = updates.maxPrice;
    if (updates.minVolumeBurst !== undefined) config.minVolumeBurst = updates.minVolumeBurst;
    if (updates.minPriceChange !== undefined) config.minPriceChange = updates.minPriceChange;
    if (updates.minVolume !== undefined) config.minVolume = updates.minVolume;
    if (updates.spikeDetectionWindow !== undefined) config.spikeDetectionWindow = updates.spikeDetectionWindow;

    // Clear detected today when config changes to re-detect with new settings
    detectedToday.clear();

    console.log(`⚙️ Config updated:`, config);

    res.json({
        success: true,
        config: config
    });
});

// WebSocket handling
wss.on('connection', (ws) => {
    console.log('👤 Client connected');
    clients.add(ws);

    // Filter out any negative/falling stocks before sending
    const filteredActiveSpikes = Array.from(activeSpikes.values()).filter(s => s.priceChange >= 0);
    const filteredCompletedSpikes = completedSpikes.filter(s => s.priceChange >= 0);

    ws.send(JSON.stringify({
        type: 'init',
        data: {
            activeSpikes: filteredActiveSpikes,
            completedSpikes: filteredCompletedSpikes,
            stats: {
                spikesDetected: stats.detected,
                bestSpike: stats.bestGain > 0 ? { priceChange: stats.bestGain } : null
            }
        }
    }));

    ws.on('close', () => {
        clients.delete(ws);
    });
});

// Cleanup function to remove any falling stocks
function cleanupFallingStocks() {
    // Remove any active spikes that are now negative
    for (const [symbol, spike] of activeSpikes) {
        if (spike.priceChange < 0) {
            console.log(`🗑️ Removing falling stock: ${symbol} (${spike.priceChange.toFixed(2)}%)`);
            activeSpikes.delete(symbol);

            // Notify clients to remove it
            broadcast({
                type: 'spikeComplete',
                data: { ...spike, reason: 'falling' }
            });
        }
    }

    // Clean completed spikes too - use splice to modify in place
    for (let i = completedSpikes.length - 1; i >= 0; i--) {
        if (completedSpikes[i].priceChange < 0) {
            completedSpikes.splice(i, 1);
        }
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 SPIKE SCANNER (REST API MODE)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 API: http://localhost:${PORT}`);
    console.log(`📡 WebSocket: ws://localhost:${WS_PORT}`);
    console.log(`⚠️  Using REST API polling (2 sec intervals)`);
    console.log(`🚀 Only tracking UPWARD spikes!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Start checking for spikes
    setInterval(checkForSpikes, config.checkInterval);
    setInterval(cleanupFallingStocks, 5000); // Clean every 5 seconds
    checkForSpikes(); // Initial check
    cleanupFallingStocks(); // Initial cleanup
});