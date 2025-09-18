const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3022;
const WS_PORT = 3023;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

// Cache for gainers
let topGainers = [];
let lastUpdate = Date.now();
let priceHistory = new Map(); // Track price history for direction (symbol -> array of last 5 prices)

// Settings
const SETTINGS = {
    minVolume: 500000,      // 500k minimum volume
    refreshInterval: 1000,   // 1 second refresh
    topCount: 50,           // Show top 50 gainers
    minPrice: 0.01,         // Minimum price
    maxPrice: 10000         // Maximum price
};

// Broadcast to all WebSocket clients
function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Fetch top gainers
async function fetchTopGainers() {
    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            // Filter and sort for top gainers with volume
            const gainers = response.data.tickers
                .filter(t => {
                    const volume = t.day?.v || t.min?.av || t.prevDay?.v || 0;
                    const price = t.day?.c || t.min?.c || t.prevDay?.c || 0;
                    const change = t.todaysChangePerc || 0;

                    return volume >= SETTINGS.minVolume &&
                           price >= SETTINGS.minPrice &&
                           price <= SETTINGS.maxPrice &&
                           change > 0; // Only gainers
                })
                .map(t => {
                    const symbol = t.ticker;
                    const currentPrice = t.day?.c || t.min?.c || t.prevDay?.c || 0;
                    const prevClose = t.prevDay?.c || 0;
                    const dayChange = t.todaysChangePerc || 0;

                    // Get or initialize price history for this symbol
                    if (!priceHistory.has(symbol)) {
                        priceHistory.set(symbol, []);
                    }
                    const history = priceHistory.get(symbol);

                    // Add current price to history
                    history.push({
                        price: currentPrice,
                        time: Date.now()
                    });

                    // Keep only last 10 price points
                    if (history.length > 10) {
                        history.shift();
                    }

                    // Determine price direction based on recent trend
                    let direction = 'flat';

                    if (history.length >= 2) {
                        const recentPrice = history[history.length - 2].price;
                        const priceDiff = currentPrice - recentPrice;
                        const percentDiff = recentPrice > 0 ? (priceDiff / recentPrice) * 100 : 0;

                        // More sensitive thresholds for movement detection
                        if (percentDiff > 0.01) direction = 'up';
                        else if (percentDiff < -0.01) direction = 'down';
                        else direction = 'flat';

                        // Log significant movements
                        if (Math.abs(percentDiff) > 0.1) {
                            console.log(`${symbol}: ${recentPrice.toFixed(3)} -> ${currentPrice.toFixed(3)} (${percentDiff.toFixed(3)}%)`);
                        }
                    } else if (dayChange > 0) {
                        // First data point, use day change
                        direction = 'up';
                    } else if (dayChange < 0) {
                        direction = 'down';
                    }

                    return {
                        symbol: symbol,
                        price: currentPrice,
                        change: t.todaysChangePerc || 0,
                        changeAmount: t.todaysChange || 0,
                        volume: t.day?.v || t.min?.av || t.prevDay?.v || 0,
                        dollarVolume: ((t.day?.c || t.min?.c || t.prevDay?.c || 0) * (t.day?.v || t.min?.av || 0)),
                        high: t.day?.h || t.prevDay?.h || 0,
                        low: t.day?.l || t.prevDay?.l || 0,
                        open: t.day?.o || t.prevDay?.o || 0,
                        prevClose: t.prevDay?.c || 0,
                        direction: direction,
                        updated: new Date(t.updated / 1000000).toLocaleTimeString()
                    };
                })
                .sort((a, b) => b.change - a.change) // Sort by % gain
                .slice(0, SETTINGS.topCount);

            topGainers = gainers;
            lastUpdate = Date.now();

            // Broadcast update to all clients
            broadcast({
                type: 'update',
                data: topGainers,
                timestamp: new Date().toISOString(),
                count: topGainers.length
            });

            return gainers;
        }
    } catch (error) {
        console.error('Error fetching gainers:', error.message);
    }
    return [];
}

// Start real-time updates
setInterval(fetchTopGainers, SETTINGS.refreshInterval);

// WebSocket connection handling
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('👤 Client connected. Total:', clients.size);

    // Send current data immediately
    ws.send(JSON.stringify({
        type: 'init',
        data: topGainers,
        settings: SETTINGS
    }));

    ws.on('close', () => {
        clients.delete(ws);
        console.log('👤 Client disconnected. Total:', clients.size);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

// REST API endpoint
app.get('/api/gainers', (req, res) => {
    res.json({
        success: true,
        count: topGainers.length,
        lastUpdate: new Date(lastUpdate).toISOString(),
        settings: SETTINGS,
        gainers: topGainers
    });
});

// Real-time HTML interface
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Real-Time Top Gainers</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', monospace;
            background: #0a0a0a;
            color: #00ff41;
            padding: 10px;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            background: #111;
            border: 1px solid #00ff41;
            margin-bottom: 10px;
        }
        h1 {
            color: #00ff41;
            font-size: 24px;
            text-shadow: 0 0 10px #00ff41;
        }
        .stats {
            display: flex;
            gap: 20px;
            font-size: 14px;
        }
        .status {
            width: 10px;
            height: 10px;
            background: #00ff41;
            border-radius: 50%;
            display: inline-block;
            animation: pulse 1s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }
        th, td {
            padding: 8px 10px;
            text-align: left;
            border-bottom: 1px solid #1a1a1a;
        }
        th {
            background: #111;
            color: #00ff41;
            position: sticky;
            top: 0;
            border-bottom: 2px solid #00ff41;
        }
        tr:hover { background: #1a1a1a; }
        .symbol {
            color: #fff;
            font-weight: bold;
            font-size: 14px;
        }
        .positive { color: #00ff41; font-weight: bold; }
        .high-gain { color: #ffff00; font-weight: bold; }
        .mega-gain { color: #ff00ff; font-weight: bold; animation: glow 1s infinite; }
        @keyframes glow {
            0%, 100% { text-shadow: 0 0 5px currentColor; }
            50% { text-shadow: 0 0 15px currentColor; }
        }
        .volume { color: #0088ff; }
        .high-volume { color: #ffaa00; font-weight: bold; }
        .price { color: #fff; }
        .updated { color: #666; font-size: 11px; }
        .direction {
            font-size: 16px;
            font-weight: bold;
            margin-right: 8px;
            display: inline-block;
            width: 20px;
            text-align: center;
        }
        .direction.up { color: #00ff41; animation: blink-up 0.5s; }
        .direction.down { color: #ff4444; animation: blink-down 0.5s; }
        .direction.flat { color: #666; }
        @keyframes blink-up {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        @keyframes blink-down {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
        .refresh-indicator {
            position: fixed;
            top: 10px;
            right: 10px;
            background: #00ff41;
            color: #000;
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: bold;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .refresh-indicator.active { opacity: 1; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 REAL-TIME TOP GAINERS</h1>
        <div class="stats">
            <div><span class="status"></span> LIVE</div>
            <div>Refresh: 1s</div>
            <div>Min Volume: 500K</div>
            <div id="count">0 Stocks</div>
            <div id="lastUpdate">--:--:--</div>
        </div>
    </div>

    <div class="refresh-indicator" id="refreshIndicator">UPDATING...</div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Symbol</th>
                <th>Price</th>
                <th>Change %</th>
                <th>Change $</th>
                <th>Volume</th>
                <th>$ Volume</th>
                <th>Day Range</th>
                <th>Updated</th>
            </tr>
        </thead>
        <tbody id="gainersBody"></tbody>
    </table>

    <script>
        const ws = new WebSocket('ws://localhost:${WS_PORT}');
        const tbody = document.getElementById('gainersBody');
        const refreshIndicator = document.getElementById('refreshIndicator');

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);

            if (message.type === 'update' || message.type === 'init') {
                updateTable(message.data || []);
                document.getElementById('count').textContent = (message.data?.length || 0) + ' Stocks';
                document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();

                // Flash refresh indicator
                refreshIndicator.classList.add('active');
                setTimeout(() => refreshIndicator.classList.remove('active'), 200);
            }
        };

        function updateTable(gainers) {
            tbody.innerHTML = '';

            gainers.forEach((stock, index) => {
                const row = tbody.insertRow();

                // Determine change class
                let changeClass = 'positive';
                if (stock.change >= 50) changeClass = 'mega-gain';
                else if (stock.change >= 20) changeClass = 'high-gain';

                // Determine volume class
                let volumeClass = stock.volume >= 10000000 ? 'high-volume' : 'volume';

                // Determine direction arrow
                let directionArrow = '';
                let directionClass = 'flat';
                if (stock.direction === 'up') {
                    directionArrow = '↑';
                    directionClass = 'up';
                } else if (stock.direction === 'down') {
                    directionArrow = '↓';
                    directionClass = 'down';
                } else {
                    directionArrow = '→';
                    directionClass = 'flat';
                }

                row.innerHTML = \`
                    <td>\${index + 1}</td>
                    <td class="symbol"><span class="direction \${directionClass}">\${directionArrow}</span>\${stock.symbol}</td>
                    <td class="price">$\${stock.price.toFixed(2)}</td>
                    <td class="\${changeClass}">+\${stock.change.toFixed(2)}%</td>
                    <td class="positive">+$\${Math.abs(stock.changeAmount).toFixed(2)}</td>
                    <td class="\${volumeClass}">\${(stock.volume/1000000).toFixed(2)}M</td>
                    <td class="volume">$\${(stock.dollarVolume/1000000).toFixed(1)}M</td>
                    <td>\${stock.low.toFixed(2)} - \${stock.high.toFixed(2)}</td>
                    <td class="updated">\${stock.updated}</td>
                \`;
            });
        }

        ws.onopen = () => console.log('✅ Connected to real-time feed');
        ws.onclose = () => {
            console.log('❌ Disconnected from real-time feed');
            setTimeout(() => location.reload(), 3000);
        };
        ws.onerror = (error) => console.error('WebSocket error:', error);
    </script>
</body>
</html>
    `);
});

// Start server
app.listen(PORT, async () => {
    console.log(`\n🚀 REAL-TIME TOP GAINERS SCANNER`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 Web Interface: http://localhost:${PORT}`);
    console.log(`📡 WebSocket: ws://localhost:${WS_PORT}`);
    console.log(`📡 REST API: http://localhost:${PORT}/api/gainers`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(`⚡ Refresh Rate: ${SETTINGS.refreshInterval/1000} second`);
    console.log(`📊 Min Volume: ${(SETTINGS.minVolume/1000000).toFixed(1)}M`);
    console.log(`🎯 Showing: Top ${SETTINGS.topCount} gainers\n`);

    // Initial fetch
    await fetchTopGainers();
    console.log(`\n✅ Found ${topGainers.length} gainers with 500k+ volume\n`);
});