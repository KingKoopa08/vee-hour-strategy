const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const FinnhubClient = require('./finnhub-client');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3050;
const WS_PORT = process.env.WS_PORT || 3051;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || 'd36lethr01qtvbti6kagd36lethr01qtvbti6kb0';

// Initialize Finnhub client
const finnhub = new FinnhubClient(FINNHUB_API_KEY);

// Cache for data
let topGainersCache = [];
let risingStocksCache = [];
let spikeDetectorCache = [];
let volumeMoversCache = [];
let volumeHistory = new Map();
let priceHistory = new Map();
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

// First, get initial symbol list from Polygon (still useful for getting the universe of stocks)
async function getStockUniverse() {
    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            // Get symbols with decent volume
            return response.data.tickers
                .filter(t => (t.day?.v || 0) > 500000)
                .map(t => t.ticker)
                .slice(0, 500); // Limit to 500 most active stocks
        }
        return [];
    } catch (error) {
        console.error('Error fetching stock universe:', error);
        return [];
    }
}

// Get real-time quotes from Finnhub
async function getRealtimeQuotes(symbols) {
    try {
        console.log(`🔄 Fetching real-time quotes for ${symbols.length} symbols from Finnhub...`);
        const quotes = await finnhub.getQuotes(symbols);

        const formattedQuotes = quotes.map(quote => {
            const data = finnhub.formatQuoteData(quote);
            return {
                ticker: data.symbol,
                currentPrice: data.price,
                dayChange: data.changePercent,
                volume: data.volume,
                previousClose: data.previousClose,
                open: data.open,
                high: data.high,
                low: data.low,
                isRealTime: true,
                source: 'finnhub',
                timestamp: new Date()
            };
        });

        return formattedQuotes;
    } catch (error) {
        console.error('Error fetching Finnhub quotes:', error);
        return [];
    }
}

// Hybrid approach: Use Polygon for stock discovery, Finnhub for real-time prices
async function getTopGainers() {
    try {
        // Step 1: Get active stocks from Polygon (for volume data and initial screening)
        const polygonUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const polygonResponse = await axios.get(polygonUrl);

        if (!polygonResponse.data || !polygonResponse.data.tickers) {
            throw new Error('No data from Polygon');
        }

        // Filter for potential gainers based on Polygon data
        let potentialGainers = polygonResponse.data.tickers
            .filter(t => {
                const dayChange = t.todaysChangePerc || 0;
                const volume = t.day?.v || 0;
                const price = t.day?.c || t.prevDay?.c || 0;
                return dayChange > 0 && volume > 500000 && price > 0.5;
            })
            .sort((a, b) => (b.todaysChangePerc || 0) - (a.todaysChangePerc || 0))
            .slice(0, 100); // Get top 100 potential gainers

        // Step 2: Get real-time prices from Finnhub for these stocks
        const symbols = potentialGainers.map(t => t.ticker);
        const realtimeQuotes = await getRealtimeQuotes(symbols);

        // Create a map for quick lookup
        const realtimeMap = new Map();
        realtimeQuotes.forEach(quote => {
            realtimeMap.set(quote.ticker, quote);
        });

        // Step 3: Merge data, preferring Finnhub real-time prices
        let gainers = potentialGainers.map(polygonData => {
            const symbol = polygonData.ticker;
            const finnhubData = realtimeMap.get(symbol);

            if (finnhubData) {
                // Use Finnhub real-time data
                return {
                    symbol: symbol,
                    price: finnhubData.currentPrice,
                    dayChange: finnhubData.dayChange,
                    volume: polygonData.day?.v || finnhubData.volume || 0,
                    dollarVolume: (finnhubData.currentPrice * (polygonData.day?.v || 0)).toFixed(0),
                    high: finnhubData.high || polygonData.day?.h || 0,
                    low: finnhubData.low || polygonData.day?.l || 0,
                    isRealTime: true,
                    source: 'finnhub',
                    lastUpdated: new Date()
                };
            } else {
                // Fallback to Polygon data
                const price = polygonData.day?.c || polygonData.prevDay?.c || 0;
                return {
                    symbol: symbol,
                    price: price,
                    dayChange: polygonData.todaysChangePerc || 0,
                    volume: polygonData.day?.v || 0,
                    dollarVolume: (price * (polygonData.day?.v || 0)).toFixed(0),
                    high: polygonData.day?.h || 0,
                    low: polygonData.day?.l || 0,
                    isRealTime: false,
                    source: 'polygon',
                    lastUpdated: new Date()
                };
            }
        });

        // Sort by day change
        gainers.sort((a, b) => b.dayChange - a.dayChange);

        // Update ranking history and calculate position changes
        const cutoff = Date.now() - POSITION_TRACKING_WINDOW;
        gainers.forEach((stock, index) => {
            const symbol = stock.symbol;
            if (!rankingHistory.has(symbol)) {
                rankingHistory.set(symbol, []);
            }
            const history = rankingHistory.get(symbol);
            history.push({ timestamp: Date.now(), rank: index + 1 });

            // Clean old entries
            const filtered = history.filter(entry => entry.timestamp > cutoff);
            rankingHistory.set(symbol, filtered);
        });

        // Add position change to each stock
        gainers = gainers.map((stock, index) => {
            const currentRank = index + 1;
            const history = rankingHistory.get(stock.symbol) || [];

            let positionChange = 0;
            if (history.length > 1) {
                const oldestEntry = history[0];
                positionChange = oldestEntry.rank - currentRank;
            }

            return {
                ...stock,
                positionChange
            };
        });

        topGainersCache = gainers.slice(0, 50); // Return top 50

        // Log data freshness
        const realtimeCount = topGainersCache.filter(s => s.isRealTime).length;
        console.log(`✅ Updated gainers: ${realtimeCount}/${topGainersCache.length} using real-time Finnhub data`);

        return topGainersCache;

    } catch (error) {
        console.error('❌ Error fetching top gainers:', error);
        return topGainersCache; // Return cached data on error
    }
}

// Get volume movers with Finnhub real-time data
async function getVolumeMovers() {
    try {
        // Similar hybrid approach for volume movers
        const polygonUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const polygonResponse = await axios.get(polygonUrl);

        if (!polygonResponse.data || !polygonResponse.data.tickers) {
            throw new Error('No data from Polygon');
        }

        // Get stocks sorted by volume
        let volumeStocks = polygonResponse.data.tickers
            .filter(t => {
                const volume = t.day?.v || 0;
                const price = t.day?.c || t.prevDay?.c || 0;
                return volume > 1000000 && price > 0.5;
            })
            .sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0))
            .slice(0, 100);

        // Get real-time prices from Finnhub
        const symbols = volumeStocks.map(t => t.ticker);
        const realtimeQuotes = await getRealtimeQuotes(symbols);

        // Create a map for quick lookup
        const realtimeMap = new Map();
        realtimeQuotes.forEach(quote => {
            realtimeMap.set(quote.ticker, quote);
        });

        // Merge data
        let movers = volumeStocks.map((polygonData, index) => {
            const symbol = polygonData.ticker;
            const finnhubData = realtimeMap.get(symbol);
            const prevVolume = polygonData.prevDay?.v || 1;
            const currentVolume = polygonData.day?.v || 0;
            const volumeChange = ((currentVolume - prevVolume) / prevVolume) * 100;

            let price, dayChange;
            if (finnhubData) {
                price = finnhubData.currentPrice;
                dayChange = finnhubData.dayChange;
            } else {
                price = polygonData.day?.c || polygonData.prevDay?.c || 0;
                dayChange = polygonData.todaysChangePerc || 0;
            }

            return {
                rank: index + 1,
                symbol: symbol,
                price: price,
                volume: currentVolume,
                volumeChange: volumeChange,
                dayChange: dayChange,
                dollarVolume: (price * currentVolume).toFixed(0),
                avgVolume: polygonData.prevDay?.v || 0,
                isRealTime: !!finnhubData,
                source: finnhubData ? 'finnhub' : 'polygon',
                lastUpdated: new Date()
            };
        });

        // Update volume ranking history
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
        });

        // Add position change
        movers = movers.map((stock, index) => {
            const currentRank = index + 1;
            const history = volumeRankingHistory.get(stock.symbol) || [];

            let positionChange = 0;
            if (history.length > 1) {
                const oldestEntry = history[0];
                positionChange = oldestEntry.rank - currentRank;
            }

            return {
                ...stock,
                positionChange
            };
        });

        volumeMoversCache = movers.slice(0, 50);

        // Log data freshness
        const realtimeCount = volumeMoversCache.filter(s => s.isRealTime).length;
        console.log(`✅ Updated volume movers: ${realtimeCount}/${volumeMoversCache.length} using real-time Finnhub data`);

        return volumeMoversCache;

    } catch (error) {
        console.error('❌ Error fetching volume movers:', error);
        return volumeMoversCache;
    }
}

// Update all data
async function updateAllData() {
    console.log('📊 Updating all market data with Finnhub real-time prices...');

    try {
        // Update all data types in parallel
        const [gainers, volumeMovers] = await Promise.all([
            getTopGainers(),
            getVolumeMovers()
        ]);

        lastUpdate = Date.now();

        // Broadcast updates to WebSocket clients
        broadcast({
            type: 'gainers',
            data: gainers,
            timestamp: lastUpdate,
            marketSession: getMarketSession()
        });

        broadcast({
            type: 'volume',
            data: volumeMovers,
            timestamp: lastUpdate,
            marketSession: getMarketSession()
        });

        console.log(`✅ All data updated at ${new Date().toLocaleTimeString()}`);

    } catch (error) {
        console.error('❌ Error updating data:', error);
    }
}

// API Routes
app.get('/api/gainers', (req, res) => {
    res.json({
        data: topGainersCache,
        timestamp: lastUpdate,
        marketSession: getMarketSession()
    });
});

app.get('/api/volume', (req, res) => {
    res.json({
        data: volumeMoversCache,
        timestamp: lastUpdate,
        marketSession: getMarketSession()
    });
});

app.get('/api/rising', (req, res) => {
    res.json({
        data: risingStocksCache,
        timestamp: lastUpdate,
        marketSession: getMarketSession()
    });
});

app.get('/api/spikes', (req, res) => {
    res.json({
        data: spikeDetectorCache,
        timestamp: lastUpdate,
        marketSession: getMarketSession()
    });
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'unified-dashboard.html'));
});

app.get('/gainers', (req, res) => {
    res.sendFile(path.join(__dirname, 'gainers-page.html'));
});

app.get('/volume', (req, res) => {
    res.sendFile(path.join(__dirname, 'volume-movers-page.html'));
});

app.get('/rising', (req, res) => {
    res.sendFile(path.join(__dirname, 'rising-stocks-page.html'));
});

app.get('/spikes', (req, res) => {
    res.sendFile(path.join(__dirname, 'spike-detector-page.html'));
});

// Start servers
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║       UNIFIED MARKET SCANNER WITH FINNHUB      ║
╠════════════════════════════════════════════════╣
║  🚀 Server:     http://localhost:${PORT}         ║
║  🔌 WebSocket:  ws://localhost:${WS_PORT}         ║
║  📊 Data:       Real-time via Finnhub API      ║
║  🔄 Updates:    Every 30 seconds                ║
╠════════════════════════════════════════════════╣
║  ENDPOINTS:                                     ║
║  • /gainers  - Top gaining stocks              ║
║  • /volume   - Volume movers                   ║
║  • /rising   - Rising stocks                   ║
║  • /spikes   - Spike detector                  ║
╚════════════════════════════════════════════════╝
    `);

    // Initial data fetch
    updateAllData();

    // Update every 30 seconds (respecting Finnhub rate limits)
    setInterval(updateAllData, 30000);
});