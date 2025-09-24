const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3050;
const WS_PORT = process.env.WS_PORT || 3051;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';

// Cache for data
let topGainersCache = [];
let risingStocksCache = [];
let spikeDetectorCache = [];
let volumeMoversCache = [];
let volumeHistory = new Map(); // Store volume history for timeframe analysis
let priceHistory = new Map(); // Store price history for timeframe analysis
let lastUpdate = Date.now();

// Volume tracking timeframes (in seconds)
const VOLUME_TIMEFRAMES = {
    '30s': 30,
    '1m': 60,
    '2m': 120,
    '3m': 180,
    '5m': 300
};

// Get current market session
function getMarketSession() {
    const now = new Date();
    // Convert to ET (Eastern Time)
    const etOffset = -5; // EST offset (use -4 for EDT)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const et = new Date(utc + (3600000 * etOffset));

    const hours = et.getHours();
    const minutes = et.getMinutes();
    const time = hours * 100 + minutes;

    // Market hours in ET
    if (time >= 400 && time < 930) {
        return 'Pre-Market';
    } else if (time >= 930 && time < 1600) {
        return 'Regular Hours';
    } else if (time >= 1600 && time < 2000) {
        return 'After Hours';
    } else {
        return 'Closed';
    }
}
let rankingHistory = new Map();
let volumeRankingHistory = new Map();
const POSITION_TRACKING_WINDOW = 5 * 60 * 1000;

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`👤 Client connected. Total: ${clients.size}`);

    // Send initial data
    ws.send(JSON.stringify({
        type: 'gainers',
        data: topGainersCache,
        timestamp: lastUpdate,
        marketSession: getMarketSession()
    }));

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`👤 Client disconnected. Total: ${clients.size}`);
    });
});

// Broadcast to all WebSocket clients
function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Get top gainers
async function getTopGainers() {
    try {
        // Fetch ALL tickers to get more gainers
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            // Filter for gainers with positive day change
            let gainers = response.data.tickers.filter(t => {
                // Get the most recent price and market session
                const marketSession = getMarketSession();
                let currentPrice, regularClosePrice;
                let dayChange = 0;
                let sessionChange = 0;
                let afterHoursChange = 0;

                // Get prices based on market session
                const prevClose = t.prevDay?.c || 0;
                const regularClose = t.day?.c || 0;
                const latestPrice = t.min?.c || t.day?.c || 0;

                // Calculate dayChange from actual prices instead of trusting API value
                // The API's todaysChangePerc is sometimes incorrect
                if (prevClose > 0 && latestPrice > 0) {
                    // Calculate the actual change from previous close to latest price
                    dayChange = ((latestPrice - prevClose) / prevClose) * 100;
                } else if (prevClose > 0 && regularClose > 0) {
                    // Fall back to regular close if no latest price
                    dayChange = ((regularClose - prevClose) / prevClose) * 100;
                } else {
                    // Only use API value as last resort
                    dayChange = t.todaysChangePerc || 0;
                }

                if (marketSession === 'After Hours') {
                    // After market hours (4:00 PM - 8:00 PM ET)
                    currentPrice = t.min?.c || t.day?.c || 0;  // Latest extended hours price

                    // After-hours change: from regular close to current after-hours price
                    if (regularClose > 0 && currentPrice > 0 && t.min?.c) {
                        afterHoursChange = ((currentPrice - regularClose) / regularClose) * 100;
                        sessionChange = afterHoursChange;
                    } else {
                        sessionChange = 0;
                    }

                } else if (marketSession === 'Pre-Market') {
                    // Pre-market hours (4:00 AM - 9:30 AM ET)
                    currentPrice = t.min?.c || prevClose || 0;  // Current pre-market price

                    // Pre-market change: from yesterday's close to current pre-market price
                    if (currentPrice > 0 && prevClose > 0 && t.min?.c) {
                        sessionChange = ((currentPrice - prevClose) / prevClose) * 100;
                    } else {
                        sessionChange = 0;
                    }

                } else if (marketSession === 'Closed') {
                    // Market closed (8:00 PM - 4:00 AM ET)
                    // Show the last available price and any after-hours movement from today
                    currentPrice = t.day?.c || t.min?.c || prevClose || 0;

                    // If there was after-hours trading today, calculate it
                    if (regularClose > 0 && t.min?.c && t.min.c !== regularClose) {
                        afterHoursChange = ((t.min.c - regularClose) / regularClose) * 100;
                        sessionChange = 0; // No active session
                    } else {
                        sessionChange = 0;
                        afterHoursChange = 0;
                    }

                } else {
                    // Regular trading hours (9:30 AM - 4:00 PM ET)
                    // Use the most recent available price
                    currentPrice = t.min?.c || t.day?.c || 0;

                    // Use our calculated dayChange (from above) which is more accurate
                    sessionChange = dayChange;

                    // Log if there's a big discrepancy with API for debugging
                    if (t.todaysChangePerc !== undefined && t.todaysChangePerc !== null) {
                        const apiChange = t.todaysChangePerc;
                        if (Math.abs(dayChange - apiChange) > 10) {
                            console.log(`📊 ${t.ticker}: Calculated=${dayChange.toFixed(2)}%, API=${apiChange.toFixed(2)}%, Price=${currentPrice}, PrevClose=${prevClose}`);
                            console.log(`   Using calculated value: ${dayChange.toFixed(2)}%`);
                        }
                    }
                }

                // Special handling for known problematic stocks
                if (t.ticker === 'MHY') {
                    console.log(`⚠️ Filtering out MHY - known bad data from API`);
                    return false;
                }

                // Store all calculated values
                t.currentPrice = currentPrice;
                t.validatedDayChange = dayChange;
                t.sessionChange = sessionChange;
                t.afterHoursChange = afterHoursChange;

                const volume = t.day?.v || t.min?.av || t.prevDay?.v || 0;
                const price = currentPrice || t.prevDay?.c || 0;

                // Include stocks with positive day change OR positive session change
                return (dayChange > 0 || sessionChange > 0) && volume > 500000 && price > 0;
            })
            .sort((a, b) => (b.validatedDayChange || 0) - (a.validatedDayChange || 0))
            .slice(0, 200); // Get top 200 gainers

            // Update ranking history
            const cutoff = Date.now() - POSITION_TRACKING_WINDOW;
            gainers.forEach((stock, index) => {
                const symbol = stock.ticker;
                if (!rankingHistory.has(symbol)) {
                    rankingHistory.set(symbol, []);
                }
                const history = rankingHistory.get(symbol);
                history.push({ timestamp: Date.now(), rank: index + 1 });

                // Clean old entries
                const filtered = history.filter(entry => entry.timestamp > cutoff);
                rankingHistory.set(symbol, filtered);
            });

            // Calculate position changes
            gainers = gainers.map((stock, index) => {
                const currentRank = index + 1;
                const history = rankingHistory.get(stock.ticker) || [];

                let positionChange = 0;
                if (history.length > 1) {
                    const oldestEntry = history[0];
                    positionChange = oldestEntry.rank - currentRank;
                }

                // Get appropriate price based on market session
                const marketSession = getMarketSession();
                let displayPrice;

                if (marketSession === 'Closed') {
                    // When market is closed, use today's close if available
                    displayPrice = stock.day?.c || stock.prevDay?.c || stock.min?.c || 0;
                } else if (marketSession === 'After Hours' || marketSession === 'Pre-Market') {
                    // During extended hours, prefer latest quote
                    displayPrice = stock.min?.c || stock.day?.c || stock.prevDay?.c || 0;
                } else {
                    // Regular hours - prefer latest quote for real-time updates
                    displayPrice = stock.min?.c || stock.day?.c || stock.prevDay?.c || 0;
                }

                // Get total daily volume - more reliable than trying to split sessions
                const totalVolume = stock.day?.v || stock.prevDay?.v || 0;
                const session = getMarketSession();

                return {
                    symbol: stock.ticker,
                    price: displayPrice,
                    dayChange: stock.validatedDayChange || stock.todaysChangePerc || 0,
                    sessionChange: stock.sessionChange || 0,
                    afterHoursChange: stock.afterHoursChange || 0,
                    volume: totalVolume,
                    volumeLabel: 'Total Volume',
                    totalVolume: totalVolume,
                    dollarVolume: ((stock.day?.c || 0) * (stock.day?.v || 0)).toFixed(0),
                    high: stock.day?.h || stock.prevDay?.h || 0,
                    low: stock.day?.l || stock.prevDay?.l || 0,
                    positionChange,
                    currentRank,
                    marketSession: session
                };
            });

            topGainersCache = gainers;
            lastUpdate = Date.now();

            // Broadcast to WebSocket clients
            broadcast({
                type: 'gainers',
                data: gainers,
                timestamp: lastUpdate,
                marketSession: getMarketSession()
            });

            return gainers;
        }
    } catch (error) {
        console.error('Error fetching gainers:', error.message);
    }
    return topGainersCache;
}

// Get rising stocks (simple scanner)
async function getRisingStocks() {
    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            const risingStocks = response.data.tickers
                .filter(t => {
                    // Calculate actual change percentage from prices - don't trust API value
                    const currentPrice = t.day?.c || t.min?.c || 0;
                    const prevClose = t.prevDay?.c || 0;
                    let dayChange = 0;

                    // Always calculate change from actual prices
                    if (currentPrice > 0 && prevClose > 0) {
                        dayChange = ((currentPrice - prevClose) / prevClose) * 100;
                    } else {
                        // Only use API value if we can't calculate
                        dayChange = t.todaysChangePerc || 0;
                    }

                    const volume = t.day?.v || t.min?.av || t.prevDay?.v || 0;
                    const price = currentPrice || prevClose || 0;

                    return dayChange >= 1.2 &&
                           volume >= 500000 &&
                           price > 0 &&
                           price <= 500;
                })
                .map(t => {
                    // Re-calculate for the map as well
                    const currentPrice = t.day?.c || t.min?.c || 0;
                    const prevClose = t.prevDay?.c || 0;
                    let dayChange = t.todaysChangePerc || 0;

                    if (currentPrice > 0 && prevClose > 0) {
                        const calculatedChange = ((currentPrice - prevClose) / prevClose) * 100;
                        if (Math.abs(dayChange - calculatedChange) > 50) {
                            dayChange = calculatedChange;
                        }
                    }

                    return {
                        symbol: t.ticker,
                        price: currentPrice || prevClose || 0,
                        dayChange: dayChange,
                        volume: t.day?.v || t.min?.av || t.prevDay?.v || 0,
                        dollarVolume: ((currentPrice || 0) * (t.day?.v || 0)).toFixed(0),
                        high: t.day?.h || t.prevDay?.h || 0,
                        low: t.day?.l || t.prevDay?.l || 0
                    };
                })
                .sort((a, b) => b.dayChange - a.dayChange);

            risingStocksCache = risingStocks;
            return risingStocks;
        }
    } catch (error) {
        console.error('Error fetching rising stocks:', error.message);
    }
    return risingStocksCache;
}

// Get volume movers with multiple timeframe analysis
async function getVolumeMovers() {
    try {
        // Use the same data as Top Gainers to ensure consistency
        const now = Date.now();

        // Update volume and price history for all stocks in topGainersCache
        topGainersCache.forEach(stock => {
            const symbol = stock.symbol;
            const currentVolume = stock.volume;
            const currentPrice = stock.price;

            // Initialize or update volume history
            if (!volumeHistory.has(symbol)) {
                volumeHistory.set(symbol, []);
            }
            if (!priceHistory.has(symbol)) {
                priceHistory.set(symbol, []);
            }

            const volHistory = volumeHistory.get(symbol);
            const prcHistory = priceHistory.get(symbol);

            volHistory.push({ time: now, volume: currentVolume });
            prcHistory.push({ time: now, price: currentPrice });

            // Clean old entries (keep only last 5 minutes)
            const fiveMinutesAgo = now - (5 * 60 * 1000);
            while (volHistory.length > 0 && volHistory[0].time < fiveMinutesAgo) {
                volHistory.shift();
            }
            while (prcHistory.length > 0 && prcHistory[0].time < fiveMinutesAgo) {
                prcHistory.shift();
            }
        });

        // Add volume and price change calculations to each stock from topGainersCache
        let movers = topGainersCache.map(stock => {
            const symbol = stock.symbol;
            const currentVolume = stock.volume;
            const currentPrice = stock.price;
            const volHistory = volumeHistory.get(symbol) || [];
            const prcHistory = priceHistory.get(symbol) || [];

            // Calculate volume and price changes for each timeframe
            const volumeChanges = {};
            const priceChanges = {};

            for (const [label, seconds] of Object.entries(VOLUME_TIMEFRAMES)) {
                const targetTime = now - (seconds * 1000);
                const oldVolEntry = volHistory.find(h => Math.abs(h.time - targetTime) < 5000); // 5s tolerance
                const oldPrcEntry = prcHistory.find(h => Math.abs(h.time - targetTime) < 5000);

                if (oldVolEntry && oldVolEntry.volume > 0) {
                    const change = ((currentVolume - oldVolEntry.volume) / oldVolEntry.volume) * 100;
                    volumeChanges[label] = change;
                } else {
                    volumeChanges[label] = 0;
                }

                if (oldPrcEntry && oldPrcEntry.price > 0) {
                    const change = ((currentPrice - oldPrcEntry.price) / oldPrcEntry.price) * 100;
                    priceChanges[label] = change;
                } else {
                    priceChanges[label] = 0;
                }
            }

            // Calculate average volume rate (volume per minute)
            const avgVolumeRate = volHistory.length > 1 ?
                (currentVolume - volHistory[0].volume) / ((now - volHistory[0].time) / 60000) : 0;

            return {
                symbol: stock.symbol,
                price: stock.price,
                dayChange: stock.dayChange,
                volume: stock.volume,
                volumeLabel: stock.volumeLabel,
                totalVolume: stock.totalVolume,
                volumeChanges: volumeChanges,
                priceChanges: priceChanges,
                avgVolumeRate: avgVolumeRate,
                high: stock.high,
                low: stock.low,
                positionChange: stock.positionChange || 0,
                currentRank: stock.currentRank || 0,
                marketSession: stock.marketSession
            };
        });

        // Sort movers by dayChange to determine volume-specific ranking
        movers.sort((a, b) => b.dayChange - a.dayChange);

        // Update volume ranking history and calculate position changes
        const cutoff = Date.now() - POSITION_TRACKING_WINDOW;
        movers.forEach((stock, index) => {
            const symbol = stock.symbol;
            if (!volumeRankingHistory.has(symbol)) {
                volumeRankingHistory.set(symbol, []);
            }
            const history = volumeRankingHistory.get(symbol);
            history.push({ timestamp: Date.now(), rank: index + 1 });

            // Clean old entries
            const filtered = history.filter(entry => entry.timestamp > cutoff);
            volumeRankingHistory.set(symbol, filtered);

            // Calculate position change for volume page
            let volumePositionChange = 0;
            if (filtered.length > 1) {
                const oldestEntry = filtered[0];
                volumePositionChange = oldestEntry.rank - (index + 1);
            }

            stock.volumeRank = index + 1;
            stock.volumePositionChange = volumePositionChange;
        });

        volumeMoversCache = movers;

        // Broadcast to WebSocket clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'volumeMovers',
                    data: movers.slice(0, 50), // Send top 50 to clients
                    timestamp: Date.now(),
                    marketSession: getMarketSession()
                }));
            }
        });
    } catch (error) {
        console.error('Error processing volume movers:', error.message);
    }
    return volumeMoversCache;
}

// Main landing page with navigation
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Market Scanner Hub</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px 20px;
        }

        .container {
            max-width: 1200px;
            width: 100%;
        }

        h1 {
            font-size: 3em;
            background: linear-gradient(135deg, #00ff41, #00ffff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-align: center;
            margin-bottom: 20px;
            text-shadow: 0 0 30px rgba(0, 255, 65, 0.3);
        }

        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 50px;
            font-size: 1.2em;
        }

        .scanner-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin-top: 40px;
        }

        .scanner-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(0, 255, 65, 0.3);
            border-radius: 15px;
            padding: 30px;
            transition: all 0.3s ease;
            cursor: pointer;
            text-decoration: none;
            color: inherit;
            display: block;
            position: relative;
            overflow: hidden;
        }

        .scanner-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, transparent, rgba(0, 255, 65, 0.1));
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .scanner-card:hover {
            transform: translateY(-5px);
            border-color: #00ff41;
            box-shadow: 0 10px 30px rgba(0, 255, 65, 0.2);
        }

        .scanner-card:hover::before {
            opacity: 1;
        }

        .scanner-card h2 {
            color: #00ff41;
            margin-bottom: 15px;
            font-size: 1.5em;
        }

        .scanner-card p {
            color: #b0b0b0;
            line-height: 1.6;
            margin-bottom: 20px;
        }

        .scanner-stats {
            display: flex;
            gap: 20px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat {
            flex: 1;
        }

        .stat-label {
            color: #666;
            font-size: 0.8em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .stat-value {
            color: #00ffff;
            font-size: 1.2em;
            font-weight: bold;
            margin-top: 5px;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #00ff41;
            margin-right: 8px;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% {
                opacity: 1;
                transform: scale(1);
            }
            50% {
                opacity: 0.5;
                transform: scale(1.2);
            }
        }

        .api-endpoints {
            margin-top: 60px;
            padding: 30px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .api-endpoints h3 {
            color: #00ffff;
            margin-bottom: 20px;
        }

        .endpoint {
            background: rgba(0, 0, 0, 0.3);
            padding: 10px 15px;
            margin: 10px 0;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            color: #00ff41;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📈 Market Scanner Hub</h1>
        <p class="subtitle">Real-time stock market analysis and scanning tools</p>

        <div class="scanner-grid">
            <a href="/gainers" class="scanner-card">
                <h2>🔥 Top Gainers</h2>
                <p>Real-time tracking of the market's biggest gainers with position change indicators</p>
                <div class="scanner-stats">
                    <div class="stat">
                        <div class="stat-label">Refresh Rate</div>
                        <div class="stat-value">1 sec</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">WebSocket</div>
                        <div class="stat-value"><span class="status-indicator"></span>Live</div>
                    </div>
                </div>
            </a>

            <a href="/volume" class="scanner-card">
                <h2>📈 Volume Movers</h2>
                <p>Real-time volume surge detection across multiple timeframes</p>
                <div class="scanner-stats">
                    <div class="stat">
                        <div class="stat-label">Timeframes</div>
                        <div class="stat-value">30s-5m</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Updates</div>
                        <div class="stat-value">Live</div>
                    </div>
                </div>
            </a>

            </div>

        <div class="api-endpoints">
            <h3>🔌 API Endpoints</h3>
            <div class="endpoint">GET /api/gainers - Get current top gainers</div>
            <div class="endpoint">WS ws://localhost:${WS_PORT} - WebSocket for real-time updates</div>
        </div>
    </div>
</body>
</html>
    `);
});

// Top Gainers page
app.get('/gainers', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Top Gainers - Real-time</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
            color: #e0e0e0;
            padding: 20px;
            min-height: 100vh;
        }

        .nav-bar {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(0, 255, 65, 0.3);
            border-radius: 10px;
            padding: 15px 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .nav-links {
            display: flex;
            gap: 20px;
        }

        .nav-links a {
            color: #00ff41;
            text-decoration: none;
            padding: 8px 15px;
            border-radius: 5px;
            transition: all 0.3s ease;
        }

        .nav-links a:hover {
            background: rgba(0, 255, 65, 0.1);
        }

        .nav-links a.active {
            background: rgba(0, 255, 65, 0.2);
            border: 1px solid rgba(0, 255, 65, 0.5);
        }

        h1 {
            font-size: 2.5em;
            background: linear-gradient(135deg, #00ff41, #00ffff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-align: center;
            margin-bottom: 20px;
        }

        .filters {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(0, 255, 65, 0.3);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
            display: flex;
            gap: 30px;
            flex-wrap: wrap;
            justify-content: center;
        }

        .filter-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .filter-group label {
            color: #00ffff;
            font-weight: 500;
        }

        .filter-group select,
        .filter-group input {
            background: rgba(0, 0, 0, 0.5);
            color: #e0e0e0;
            border: 1px solid rgba(0, 255, 65, 0.3);
            border-radius: 5px;
            padding: 8px 12px;
            font-size: 14px;
        }

        .status {
            text-align: center;
            padding: 15px;
            background: rgba(0, 255, 65, 0.1);
            border-radius: 10px;
            margin-bottom: 20px;
            border: 1px solid rgba(0, 255, 65, 0.3);
        }

        .status.connected {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% {
                border-color: rgba(0, 255, 65, 0.3);
            }
            50% {
                border-color: rgba(0, 255, 65, 0.8);
            }
        }

        table {
            width: 100%;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid rgba(0, 255, 65, 0.2);
        }

        th {
            background: rgba(0, 255, 65, 0.1);
            padding: 15px;
            text-align: left;
            font-weight: 600;
            color: #00ff41;
            border-bottom: 2px solid rgba(0, 255, 65, 0.3);
        }

        td {
            padding: 12px 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        tr:hover {
            background: rgba(0, 255, 65, 0.05);
        }

        .symbol {
            font-weight: bold;
            color: #00ffff;
            font-size: 1.1em;
        }

        .positive {
            color: #00ff41;
            font-weight: 500;
        }

        .negative {
            color: #ff4444;
        }

        .high-volume {
            color: #ffd700;
            font-weight: bold;
        }

        .position-change {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
            min-width: 50px;
            text-align: center;
        }

        .position-change.up {
            background: rgba(0, 255, 65, 0.2);
            color: #00ff41;
        }

        .position-change.down {
            background: rgba(255, 68, 68, 0.2);
            color: #ff4444;
        }

        .position-change.neutral {
            background: rgba(255, 255, 255, 0.1);
            color: #888;
        }
    </style>
</head>
<body>
    <div class="nav-bar">
        <div class="nav-links">
            <a href="/">🏠 Home</a>
            <a href="/gainers" class="active">🔥 Top Gainers</a>
            <a href="/volume">📊 Volume Movers</a>
        </div>
        <div id="connection-status">🔴 Connecting...</div>
    </div>

    <h1>🔥 Real-Time Top Gainers</h1>

    <div id="marketSession" style="text-align: center; margin-bottom: 20px; padding: 10px; background: rgba(0, 255, 65, 0.1); border: 1px solid rgba(0, 255, 65, 0.3); border-radius: 10px;">
        <span style="color: #00ffff; font-weight: 600;">Market Session: </span>
        <span id="sessionName" style="color: #00ff41; font-weight: bold;">Loading...</span>
    </div>

    <div class="filters">
        <div class="filter-group">
            <label for="stockLimit">Show Top:</label>
            <select id="stockLimit">
                <option value="10">10 Stocks</option>
                <option value="20">20 Stocks</option>
                <option value="30">30 Stocks</option>
                <option value="50" selected>50 Stocks</option>
                <option value="100">100 Stocks</option>
            </select>
        </div>
        <div class="filter-group">
            <label for="minGain">Min Gain:</label>
            <input type="number" id="minGain" value="0" step="0.5" style="width: 80px">
            <span>%</span>
        </div>
        <div class="filter-group">
            <label for="minVolume">Min Volume:</label>
            <select id="minVolume">
                <option value="0">Any</option>
                <option value="500000" selected>500K+</option>
                <option value="1000000">1M+</option>
                <option value="5000000">5M+</option>
                <option value="10000000">10M+</option>
            </select>
        </div>
    </div>

    <div id="status" class="status">
        <span id="count">Loading...</span> |
        <span id="lastUpdate">Never</span> |
        <span>Auto-refresh: 1 second</span>
    </div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Symbol</th>
                <th>Price</th>
                <th>Day Change</th>
                <th>Position Δ (5m)</th>
                <th>Volume</th>
                <th>$ Volume</th>
                <th>Day Range</th>
            </tr>
        </thead>
        <tbody id="stocksBody">
            <tr><td colspan="8" style="text-align: center; padding: 40px;">Loading data...</td></tr>
        </tbody>
    </table>

    <script>
        let ws;
        let allStocks = [];
        let filters = {
            limit: 50,
            minGain: 0,
            minVolume: 500000
        };

        // Connect to WebSocket
        function connect() {
            const wsHost = window.location.hostname || 'localhost';
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // For HTTPS, use /ws path (proxied by Nginx). For HTTP, use port 3051
            const wsUrl = protocol === 'wss:'
                ? protocol + '//' + wsHost + '/ws'
                : protocol + '//' + wsHost + ':3051';
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('Connected to WebSocket');
                document.getElementById('connection-status').innerHTML = '🟢 Connected';
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'gainers') {
                    allStocks = message.data;
                    updateDisplay();

                    // Update market session if provided
                    if (message.marketSession) {
                        document.getElementById('sessionName').textContent = message.marketSession;
                    }
                }
            };

            ws.onclose = () => {
                document.getElementById('connection-status').innerHTML = '🔴 Disconnected';
                setTimeout(connect, 2000);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        }

        // Update display with filters
        function updateDisplay() {
            let filteredStocks = allStocks
                .filter(stock =>
                    stock.dayChange >= filters.minGain &&
                    stock.volume >= filters.minVolume
                )
                .slice(0, filters.limit);

            const tbody = document.getElementById('stocksBody');
            tbody.innerHTML = '';

            if (filteredStocks.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;">No stocks match the current filters</td></tr>';
                document.getElementById('count').textContent = 'No stocks found';
                return;
            }

            filteredStocks.forEach((stock, index) => {
                const row = tbody.insertRow();

                // Determine position change styling
                let positionClass = 'neutral';
                let positionText = '—';
                if (stock.positionChange > 0) {
                    positionClass = 'up';
                    positionText = '+' + stock.positionChange;
                } else if (stock.positionChange < 0) {
                    positionClass = 'down';
                    positionText = stock.positionChange.toString();
                }

                const volumeClass = stock.volume > 5000000 ? 'high-volume' : '';

                row.innerHTML = \`
                    <td>\${index + 1}</td>
                    <td class="symbol">\${stock.symbol}</td>
                    <td>$\${stock.price.toFixed(2)}</td>
                    <td class="positive">+\${stock.dayChange.toFixed(2)}%</td>
                    <td><span class="position-change \${positionClass}">\${positionText}</span></td>
                    <td class="\${volumeClass}">\${(stock.volume/1000000).toFixed(1)}M</td>
                    <td>$\${(stock.dollarVolume/1000000).toFixed(1)}M</td>
                    <td>$\${stock.low.toFixed(2)} - $\${stock.high.toFixed(2)}</td>
                \`;
            });

            document.getElementById('count').textContent = \`Showing \${filteredStocks.length} stocks\`;
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
        }

        // Setup filter event listeners
        document.getElementById('stockLimit').addEventListener('change', (e) => {
            filters.limit = parseInt(e.target.value);
            updateDisplay();
        });

        document.getElementById('minGain').addEventListener('input', (e) => {
            filters.minGain = parseFloat(e.target.value) || 0;
            updateDisplay();
        });

        document.getElementById('minVolume').addEventListener('change', (e) => {
            filters.minVolume = parseInt(e.target.value);
            updateDisplay();
        });

        // Start connection
        connect();
    </script>
</body>
</html>
    `);
});

// Rising stocks page


// Spike detector page (placeholder)


// Volume Movers page
app.get('/volume', (req, res) => {
    const htmlContent = fs.readFileSync(path.join(__dirname, 'volume-movers-page.html'), 'utf8');
    res.send(htmlContent);
});

// API endpoints
app.get('/api/gainers', async (req, res) => {
    const gainers = await getTopGainers();
    res.json({
        success: true,
        count: gainers.length,
        stocks: gainers
    });
});

app.get('/api/rising', async (req, res) => {
    const stocks = await getRisingStocks();
    res.json({
        success: true,
        count: stocks.length,
        criteria: {
            minDayChange: 1.2,
            minVolume: 500000,
            maxPrice: 500
        },
        stocks: stocks
    });
});

app.get('/api/volume', async (req, res) => {
    let stocks = await getVolumeMovers();

    // Get sorting parameters
    const sortBy = req.query.sortBy || 'dayChange';  // dayChange, priceChange30s, priceChange1m, volumeChange30s, volumeChange1m, etc.
    const sortOrder = req.query.sortOrder || 'desc';  // asc or desc
    const secondarySort = req.query.secondarySort;  // Optional secondary sort

    // Apply sorting
    stocks = stocks.sort((a, b) => {
        let compareValue = 0;

        // Primary sort
        if (sortBy === 'dayChange') {
            compareValue = (b.dayChange || 0) - (a.dayChange || 0);
        } else if (sortBy.startsWith('priceChange')) {
            const timeframe = sortBy.replace('priceChange', '');
            compareValue = (b.priceChanges?.[timeframe] || 0) - (a.priceChanges?.[timeframe] || 0);
        } else if (sortBy.startsWith('volumeChange')) {
            const timeframe = sortBy.replace('volumeChange', '');
            compareValue = (b.volumeChanges?.[timeframe] || 0) - (a.volumeChanges?.[timeframe] || 0);
        }

        // If primary sort values are equal and secondary sort is specified
        if (compareValue === 0 && secondarySort) {
            if (secondarySort === 'dayChange') {
                compareValue = (b.dayChange || 0) - (a.dayChange || 0);
            } else if (secondarySort.startsWith('priceChange')) {
                const timeframe = secondarySort.replace('priceChange', '');
                compareValue = (b.priceChanges?.[timeframe] || 0) - (a.priceChanges?.[timeframe] || 0);
            } else if (secondarySort.startsWith('volumeChange')) {
                const timeframe = secondarySort.replace('volumeChange', '');
                compareValue = (b.volumeChanges?.[timeframe] || 0) - (a.volumeChanges?.[timeframe] || 0);
            }
        }

        // Handle sort order
        return sortOrder === 'asc' ? -compareValue : compareValue;
    });

    res.json({
        success: true,
        count: stocks.length,
        stocks: stocks,
        sortBy: sortBy,
        sortOrder: sortOrder,
        secondarySort: secondarySort,
        marketSession: getMarketSession()
    });
});

app.get('/api/spikes', (req, res) => {
    res.json({
        success: true,
        message: 'Spike detection endpoint - coming soon',
        spikes: []
    });
});

// Dynamic update interval based on market hours
let updateInterval;
const startUpdates = () => {
    if (updateInterval) clearInterval(updateInterval);

    const marketSession = getMarketSession();
    // Use 1 second during market hours for real-time updates, 60 seconds when closed
    const interval = marketSession === 'Closed' ? 60000 : 1000;

    updateInterval = setInterval(async () => {
        await getTopGainers();
        await getVolumeMovers(); // Update volume movers data

        const currentSession = getMarketSession();

        // Broadcast volume movers to WebSocket clients
        broadcast({
            type: 'volumeMovers',
            data: volumeMoversCache,
            marketSession: currentSession
        });

        console.log(`✅ Updated ${topGainersCache.length} gainers, ${volumeMoversCache.length} volume movers | Session: ${currentSession}`);

        // Check if market session changed to adjust interval
        if ((currentSession === 'Closed' && interval === 1000) ||
            (currentSession !== 'Closed' && interval === 60000)) {
            startUpdates(); // Restart with new interval
        }
    }, interval);

    console.log(`📊 Update interval set to ${interval/1000} seconds (Market: ${marketSession})`);
};

// Start the updates
startUpdates();

// Update rising stocks every 10 seconds
setInterval(async () => {
    await getRisingStocks();
}, 10000);

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 UNIFIED MARKET SCANNER HUB`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 Main Hub: http://localhost:${PORT}`);
    console.log(`📡 Top Gainers: http://localhost:${PORT}/gainers`);
    console.log(`📡 Volume Movers: http://localhost:${PORT}/volume`);
    console.log(`📡 WebSocket: ws://localhost:${WS_PORT}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});