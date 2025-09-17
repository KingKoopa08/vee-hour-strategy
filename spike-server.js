const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const PolygonRealtimeClient = require('./polygon-realtime');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.SPIKE_PORT || 3020;
const WS_PORT = process.env.SPIKE_WS_PORT || 3008;

// Polygon configuration
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';

// Initialize Polygon real-time client
const polygonClient = new PolygonRealtimeClient(POLYGON_API_KEY);

// WebSocket server for frontend
const wss = new WebSocketServer({ port: WS_PORT });

// Connected clients
const clients = new Set();

// Active spikes tracking
const activeSpikes = new Map();
const completedSpikes = [];
const watchList = new Map();

// Statistics
const stats = {
    spikesDetected: 0,
    totalVolume: 0,
    bestSpike: null,
    startTime: Date.now()
};

// Broadcast to all connected clients
function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
            client.send(message);
        }
    });
}

// Handle Polygon events
polygonClient.on('spike', (spike) => {
    console.log(`\n🚨 NEW SPIKE DETECTED 🚨`);
    console.log(`Symbol: ${spike.symbol}`);
    console.log(`Price: $${spike.startPrice.toFixed(2)} → $${spike.currentPrice.toFixed(2)}`);
    console.log(`Change: +${spike.priceChange.toFixed(2)}% in ${spike.duration}s`);
    console.log(`Volume Burst: ${spike.volumeBurst.toFixed(1)}x normal`);

    // Add to active spikes
    activeSpikes.set(spike.symbol, spike);
    stats.spikesDetected++;

    // Broadcast to all clients
    broadcast({
        type: 'spike',
        data: spike,
        timestamp: new Date().toISOString()
    });

    // Send push notification style alert
    broadcast({
        type: 'alert',
        level: 'urgent',
        title: `🚀 ${spike.symbol} SPIKING NOW`,
        message: `+${spike.priceChange.toFixed(1)}% with ${spike.volumeBurst.toFixed(0)}x volume`,
        data: spike
    });
});

polygonClient.on('spikeUpdate', (spike) => {
    // Update active spike
    activeSpikes.set(spike.symbol, spike);

    // Broadcast update
    broadcast({
        type: 'spikeUpdate',
        data: spike,
        timestamp: new Date().toISOString()
    });

    // Send exit warning if needed
    if (spike.duration > 45 && spike.momentum === 'SLOWING') {
        broadcast({
            type: 'alert',
            level: 'warning',
            title: `⚠️ ${spike.symbol} Exit Signal`,
            message: `Momentum slowing after ${spike.duration.toFixed(0)}s`,
            data: spike
        });
    }
});

polygonClient.on('spikeEnd', (spike) => {
    // Move to completed
    activeSpikes.delete(spike.symbol);
    completedSpikes.unshift(spike); // Add to front
    if (completedSpikes.length > 20) {
        completedSpikes.pop(); // Keep only last 20
    }

    // Update best spike
    if (!stats.bestSpike || spike.priceChange > stats.bestSpike.priceChange) {
        stats.bestSpike = spike;
    }

    // Broadcast completion
    broadcast({
        type: 'spikeComplete',
        data: spike,
        timestamp: new Date().toISOString()
    });
});

polygonClient.on('trade', (trade) => {
    // Broadcast significant trades to frontend
    if (trade.size > 10000 || trade.price * trade.size > 100000) {
        broadcast({
            type: 'largeTrade',
            data: trade,
            timestamp: new Date().toISOString()
        });
    }
});

polygonClient.on('quote', (quote) => {
    // Track spread for active spikes
    if (activeSpikes.has(quote.symbol)) {
        const spike = activeSpikes.get(quote.symbol);
        spike.spread = quote.spread;
        spike.spreadPercent = quote.spreadPercent;
    }
});

// API endpoints
app.get('/api/spikes/active', (req, res) => {
    res.json({
        success: true,
        spikes: Array.from(activeSpikes.values()),
        count: activeSpikes.size,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/spikes/completed', (req, res) => {
    res.json({
        success: true,
        spikes: completedSpikes,
        count: completedSpikes.length,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/spikes/stats', (req, res) => {
    const runtime = (Date.now() - stats.startTime) / 1000 / 60; // minutes
    res.json({
        success: true,
        stats: {
            ...stats,
            runtime: runtime.toFixed(1),
            spikesPerHour: (stats.spikesDetected / runtime * 60).toFixed(1),
            activeNow: activeSpikes.size
        },
        timestamp: new Date().toISOString()
    });
});

app.post('/api/spikes/subscribe', (req, res) => {
    const { symbols } = req.body;
    if (symbols && Array.isArray(symbols)) {
        polygonClient.subscribe(symbols);
        res.json({ success: true, subscribed: symbols });
    } else {
        res.status(400).json({ success: false, error: 'Invalid symbols' });
    }
});

app.post('/api/spikes/config', (req, res) => {
    const config = req.body;
    polygonClient.updateConfig(config);
    res.json({ success: true, config });
});

// Get top volume stocks to monitor
async function loadTopVolumeStocks() {
    try {
        console.log('📊 Loading top volume stocks...');
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            // Filter for liquid stocks under $100
            const candidates = response.data.tickers
                .filter(t => {
                    const price = t.day?.c || t.prevDay?.c || 0;
                    const volume = t.day?.v || t.prevDay?.v || 0;
                    return price > 0.5 && price < 100 && volume > 1000000;
                })
                .sort((a, b) => (b.day?.v || 0) - (a.day?.v || 0))
                .slice(0, 200) // Top 200 by volume
                .map(t => t.ticker);

            console.log(`📈 Found ${candidates.length} liquid stocks under $100`);

            // Subscribe to top candidates
            if (candidates.length > 0) {
                polygonClient.subscribe(candidates.slice(0, 100)); // Start with top 100
            }

            return candidates;
        }
    } catch (error) {
        console.error('Error loading stocks:', error.message);
    }
    return [];
}

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('👤 Client connected');
    clients.add(ws);

    // Send current state to new client
    ws.send(JSON.stringify({
        type: 'init',
        data: {
            activeSpikes: Array.from(activeSpikes.values()),
            completedSpikes: completedSpikes,
            stats: stats
        },
        timestamp: new Date().toISOString()
    }));

    ws.on('close', () => {
        console.log('👤 Client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

// Start the server
app.listen(PORT, async () => {
    console.log(`\n🚀 SPIKE DETECTION SERVER`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 API: http://localhost:${PORT}`);
    console.log(`📡 WebSocket: ws://localhost:${WS_PORT}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Connect to Polygon
    polygonClient.connect();

    // Load and subscribe to top stocks after connection
    polygonClient.once('authenticated', async () => {
        await loadTopVolumeStocks();
        console.log('\n✅ System ready - monitoring for spikes...\n');
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    polygonClient.disconnect();
    wss.close();
    process.exit(0);
});