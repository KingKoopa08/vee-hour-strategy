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
let rankingHistory = new Map(); // Track ranking positions over time (symbol -> {timestamp, rank}[])
const POSITION_TRACKING_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds

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
                .map(t => ({
                    symbol: t.ticker,
                    price: t.day?.c || t.min?.c || t.prevDay?.c || 0,
                    change: t.todaysChangePerc || 0,
                    changeAmount: t.todaysChange || 0,
                    volume: t.day?.v || t.min?.av || t.prevDay?.v || 0,
                    dollarVolume: ((t.day?.c || t.min?.c || t.prevDay?.c || 0) * (t.day?.v || t.min?.av || 0)),
                    high: t.day?.h || t.prevDay?.h || 0,
                    low: t.day?.l || t.prevDay?.l || 0,
                    open: t.day?.o || t.prevDay?.o || 0,
                    prevClose: t.prevDay?.c || 0,
                    updated: new Date(t.updated / 1000000).toLocaleTimeString()
                }))
                .sort((a, b) => b.change - a.change) // Sort by % gain
                .slice(0, SETTINGS.topCount);

            // Track position changes
            const now = Date.now();
            const cutoffTime = now - POSITION_TRACKING_WINDOW;

            // Update ranking history for each stock
            gainers.forEach((stock, index) => {
                const rank = index + 1;
                if (!rankingHistory.has(stock.symbol)) {
                    rankingHistory.set(stock.symbol, []);
                }

                const history = rankingHistory.get(stock.symbol);
                history.push({ timestamp: now, rank });

                // Remove old entries outside 5-minute window
                while (history.length > 0 && history[0].timestamp < cutoffTime) {
                    history.shift();
                }
            });

            // Calculate position changes for each stock
            gainers = gainers.map((stock, index) => {
                const currentRank = index + 1;
                const history = rankingHistory.get(stock.symbol) || [];

                // Find oldest rank in 5-minute window
                let positionChange = 0;
                if (history.length > 1) {
                    const oldestEntry = history[0];
                    positionChange = oldestEntry.rank - currentRank; // Positive means climbed, negative means fell
                }

                return {
                    ...stock,
                    positionChange,
                    currentRank
                };
            });

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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            color: #e0e0e0;
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1600px;
            margin: 0 auto;
        }
        .header {
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        h1 {
            color: #4ade80;
            font-size: 28px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .live-badge {
            background: #4ade80;
            color: #1a1a1a;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        .stats {
            display: flex;
            gap: 24px;
            font-size: 14px;
            color: #9ca3af;
        }
        .stat-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .stat-label {
            font-size: 12px;
            color: #6b7280;
            text-transform: uppercase;
        }
        .stat-value {
            color: #e0e0e0;
            font-weight: 600;
        }
        .controls {
            display: flex;
            gap: 16px;
            align-items: center;
            padding: 16px;
            background: #2a2a2a;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .filter-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .filter-group label {
            font-size: 14px;
            color: #9ca3af;
        }
        .filter-group select, .filter-group input {
            padding: 8px 12px;
            background: #1a1a1a;
            border: 1px solid #3a3a3a;
            border-radius: 6px;
            color: #e0e0e0;
            font-size: 14px;
            min-width: 100px;
        }
        .filter-group select:focus, .filter-group input:focus {
            outline: none;
            border-color: #4ade80;
        }
        .table-container {
            background: #2a2a2a;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: #1f1f1f;
            color: #9ca3af;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
            padding: 16px 12px;
            text-align: left;
            position: sticky;
            top: 0;
            z-index: 10;
            border-bottom: 2px solid #3a3a3a;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #3a3a3a;
            font-size: 14px;
        }
        tbody tr {
            transition: background 0.2s;
        }
        tbody tr:hover {
            background: #333;
        }
        tbody tr:nth-child(even) {
            background: rgba(255, 255, 255, 0.02);
        }
        .rank {
            color: #6b7280;
            font-weight: 600;
            font-size: 12px;
        }
        .symbol-cell {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .symbol {
            color: #fff;
            font-weight: 600;
            font-size: 16px;
        }
        .price {
            color: #e0e0e0;
            font-weight: 500;
        }
        .positive {
            color: #4ade80;
            font-weight: 600;
        }
        .negative {
            color: #f87171;
            font-weight: 600;
        }
        .high-gain {
            color: #fbbf24;
            font-weight: 600;
        }
        .mega-gain {
            color: #a78bfa;
            font-weight: 600;
            animation: glow 2s infinite;
        }
        @keyframes glow {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        .volume {
            color: #60a5fa;
        }
        .high-volume {
            color: #fb923c;
            font-weight: 600;
        }
        .position-change {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 45px;
            padding: 3px 6px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            margin-right: 8px;
        }
        .position-change.climbed {
            background: rgba(74, 222, 128, 0.15);
            color: #4ade80;
        }
        .position-change.fell {
            background: rgba(248, 113, 113, 0.15);
            color: #f87171;
        }
        .position-change.unchanged {
            background: rgba(107, 114, 128, 0.1);
            color: #6b7280;
        }
        .position-change.new {
            background: rgba(168, 85, 247, 0.15);
            color: #a855f7;
        }
        .position-arrow {
            font-size: 10px;
            margin-left: 2px;
        }
        .range {
            color: #9ca3af;
            font-size: 13px;
        }
        .updated {
            color: #6b7280;
            font-size: 12px;
        }
        .refresh-indicator {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #4ade80;
            color: #1a1a1a;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            opacity: 0;
            transition: opacity 0.2s;
            box-shadow: 0 2px 8px rgba(74, 222, 128, 0.3);
        }
        .refresh-indicator.active {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-top">
                <h1>
                    📈 Top Gainers
                    <span class="live-badge">LIVE</span>
                </h1>
                <div class="stats">
                    <div class="stat-item">
                        <span class="stat-label">Refresh Rate</span>
                        <span class="stat-value">1 second</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Min Volume</span>
                        <span class="stat-value">500K</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Stocks</span>
                        <span class="stat-value" id="count">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Last Update</span>
                        <span class="stat-value" id="lastUpdate">--:--:--</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="controls">
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
                <select id="minGain">
                    <option value="0">All Gainers</option>
                    <option value="5">5%+</option>
                    <option value="10">10%+</option>
                    <option value="20">20%+</option>
                    <option value="50">50%+</option>
                </select>
            </div>
            <div class="filter-group">
                <label for="minVolume">Min Volume:</label>
                <select id="minVolume">
                    <option value="500000" selected>500K+</option>
                    <option value="1000000">1M+</option>
                    <option value="5000000">5M+</option>
                    <option value="10000000">10M+</option>
                </select>
            </div>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 50px">#</th>
                        <th style="width: 150px">Symbol</th>
                        <th style="width: 100px">Price</th>
                        <th style="width: 100px">Change %</th>
                        <th style="width: 100px">Change $</th>
                        <th style="width: 120px">Volume</th>
                        <th style="width: 120px">$ Volume</th>
                        <th style="width: 150px">Day Range</th>
                        <th>Updated</th>
                    </tr>
                </thead>
                <tbody id="gainersBody"></tbody>
            </table>
        </div>
    </div>

    <div class="refresh-indicator" id="refreshIndicator">UPDATING...</div>

    <script>
        const ws = new WebSocket('ws://localhost:${WS_PORT}');
        const tbody = document.getElementById('gainersBody');
        const refreshIndicator = document.getElementById('refreshIndicator');

        let allGainers = [];
        let filters = {
            stockLimit: 50,
            minGain: 0,
            minVolume: 500000
        };

        // Filter controls
        document.getElementById('stockLimit').addEventListener('change', (e) => {
            filters.stockLimit = parseInt(e.target.value);
            applyFilters();
        });

        document.getElementById('minGain').addEventListener('change', (e) => {
            filters.minGain = parseFloat(e.target.value);
            applyFilters();
        });

        document.getElementById('minVolume').addEventListener('change', (e) => {
            filters.minVolume = parseInt(e.target.value);
            applyFilters();
        });

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);

            if (message.type === 'update' || message.type === 'init') {
                allGainers = message.data || [];
                document.getElementById('count').textContent = allGainers.length;
                document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
                applyFilters();

                // Flash refresh indicator
                refreshIndicator.classList.add('active');
                setTimeout(() => refreshIndicator.classList.remove('active'), 200);
            }
        };

        function applyFilters() {
            let filtered = allGainers
                .filter(stock => stock.change >= filters.minGain)
                .filter(stock => stock.volume >= filters.minVolume)
                .slice(0, filters.stockLimit);

            updateTable(filtered);
        }

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

                // Determine position change display
                let positionDisplay = '';
                let positionClass = 'unchanged';
                let positionArrow = '';

                if (stock.positionChange > 0) {
                    positionDisplay = '+' + stock.positionChange;
                    positionClass = 'climbed';
                    positionArrow = '↑';
                } else if (stock.positionChange < 0) {
                    positionDisplay = '' + stock.positionChange;
                    positionClass = 'fell';
                    positionArrow = '↓';
                } else if (stock.positionChange === 0) {
                    positionDisplay = '—';
                    positionClass = 'unchanged';
                } else {
                    positionDisplay = 'NEW';
                    positionClass = 'new';
                }

                const positionIndicator = positionArrow ?
                    positionDisplay + '<span class="position-arrow">' + positionArrow + '</span>' :
                    positionDisplay;

                row.innerHTML = \`
                    <td class="rank">\${index + 1}</td>
                    <td class="symbol-cell">
                        <span class="position-change \${positionClass}">
                            \${positionIndicator}
                        </span>
                        <span class="symbol">\${stock.symbol}</span>
                    </td>
                    <td class="price">$\${stock.price.toFixed(2)}</td>
                    <td class="\${changeClass}">+\${stock.change.toFixed(2)}%</td>
                    <td class="positive">+$\${Math.abs(stock.changeAmount).toFixed(2)}</td>
                    <td class="\${volumeClass}">\${(stock.volume/1000000).toFixed(2)}M</td>
                    <td class="volume">$\${(stock.dollarVolume/1000000).toFixed(1)}M</td>
                    <td class="range">\${stock.low.toFixed(2)} - \${stock.high.toFixed(2)}</td>
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