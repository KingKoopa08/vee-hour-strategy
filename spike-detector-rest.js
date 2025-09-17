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
let stats = { detected: 0, bestGain: 0 };

// Configuration - VERY sensitive for testing
const config = {
    maxPrice: 100,
    minVolumeBurst: 1.5, // Lowered to 1.5x volume
    minPriceChange: 0.2, // Lowered to 0.2% change
    minVolume: 50000, // Lowered minimum volume
    checkInterval: 2000, // Check every 2 seconds
    historyDuration: 60000 // Keep 60 seconds
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
            // Filter for liquid stocks under max price
            return response.data.tickers
                .filter(t => {
                    const price = t.day?.c || t.min?.c || t.prevDay?.c || 0;
                    const volume = t.day?.v || t.min?.av || 0;
                    return price > 0.5 && price < config.maxPrice && volume > config.minVolume;
                })
                .sort((a, b) => {
                    const volA = a.day?.v || a.min?.av || 0;
                    const volB = b.day?.v || b.min?.av || 0;
                    return volB - volA;
                })
                .slice(0, 100) // Top 100 by volume
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

// Detect spike
function detectSpike(symbol, currentData) {
    const history = priceHistory.get(symbol);
    if (!history || history.length < 5) return null;

    // Get data from 10 seconds ago
    const now = Date.now();
    const past10s = now - 10000;
    const past30s = now - 30000;

    const recent = history.filter(h => h.timestamp > past10s);
    const baseline = history.filter(h => h.timestamp > past30s && h.timestamp <= past10s);

    if (recent.length < 2 || baseline.length < 2) return null;

    // Calculate metrics
    const recentAvgVolume = recent.reduce((sum, h) => sum + h.volume, 0) / recent.length;
    const baselineAvgVolume = baseline.reduce((sum, h) => sum + h.volume, 0) / Math.max(baseline.length, 1);

    const volumeBurst = baselineAvgVolume > 0 ? recentAvgVolume / baselineAvgVolume : 0;

    const priceChange = recent.length > 0 ?
        ((currentData.price - recent[0].price) / recent[0].price) * 100 : 0;

    // Check for spike
    if (volumeBurst >= config.minVolumeBurst &&
        Math.abs(priceChange) >= config.minPriceChange &&
        currentData.volume > config.minVolume) {

        return {
            symbol,
            startPrice: recent[0].price,
            currentPrice: currentData.price,
            priceChange,
            volumeBurst,
            volume: currentData.volume,
            startTime: now
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

            // Check for spike
            const spike = detectSpike(stock.symbol, stock);

            // ONLY check for stocks that are UP significantly today (not down!)
            if (!spike && !activeSpikes.has(stock.symbol) && stock.changePercent > 5) {
                // This stock is already UP significantly today
                const highMover = {
                    symbol: stock.symbol,
                    startPrice: stock.price * (1 - stock.changePercent/100),
                    currentPrice: stock.price,
                    priceChange: stock.changePercent,
                    volumeBurst: 1, // Unknown
                    volume: stock.volume,
                    startTime: Date.now() - 60000, // Assume started earlier
                    momentum: 'HOT',
                    duration: 60,
                    highPrice: stock.price
                };

                activeSpikes.set(stock.symbol, highMover);
                stats.detected++;

                console.log(`🚀 RISING: ${stock.symbol} +${stock.changePercent.toFixed(2)}% | Vol: ${(stock.volume/1000000).toFixed(1)}M`);

                broadcast({
                    type: 'spike',
                    data: highMover
                });
            } else if (spike && !activeSpikes.has(stock.symbol)) {
                // New spike!
                activeSpikes.set(stock.symbol, spike);
                stats.detected++;

                console.log(`🚨 SPIKE: ${spike.symbol} ${spike.priceChange > 0 ? '+' : ''}${spike.priceChange.toFixed(2)}% with ${spike.volumeBurst.toFixed(1)}x volume`);

                broadcast({
                    type: 'spike',
                    data: {
                        ...spike,
                        momentum: 'ACCELERATING',
                        duration: 0
                    }
                });
            } else if (activeSpikes.has(stock.symbol)) {
                // Update existing spike
                const spike = activeSpikes.get(stock.symbol);
                spike.currentPrice = stock.price;
                spike.priceChange = ((stock.price - spike.startPrice) / spike.startPrice) * 100;
                spike.duration = (Date.now() - spike.startTime) / 1000;

                // Check if spike is ending (60 seconds or price reversal)
                if (spike.duration > 60 || Math.abs(spike.priceChange) < config.minPriceChange / 2) {
                    activeSpikes.delete(stock.symbol);
                    completedSpikes.unshift(spike);
                    if (completedSpikes.length > 20) completedSpikes.pop();

                    if (Math.abs(spike.priceChange) > stats.bestGain) {
                        stats.bestGain = Math.abs(spike.priceChange);
                    }

                    broadcast({
                        type: 'spikeComplete',
                        data: spike
                    });
                } else {
                    broadcast({
                        type: 'spikeUpdate',
                        data: {
                            ...spike,
                            momentum: spike.priceChange > 0 ? 'RISING' : 'FALLING'
                        }
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

// WebSocket handling
wss.on('connection', (ws) => {
    console.log('👤 Client connected');
    clients.add(ws);

    ws.send(JSON.stringify({
        type: 'init',
        data: {
            activeSpikes: Array.from(activeSpikes.values()),
            completedSpikes: completedSpikes,
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

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 SPIKE SCANNER (REST API MODE)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 API: http://localhost:${PORT}`);
    console.log(`📡 WebSocket: ws://localhost:${WS_PORT}`);
    console.log(`⚠️  Using REST API polling (2 sec intervals)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Start checking for spikes
    setInterval(checkForSpikes, config.checkInterval);
    checkForSpikes(); // Initial check
});