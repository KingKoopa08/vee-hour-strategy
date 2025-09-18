const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
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
let lastUpdate = Date.now();
let rankingHistory = new Map();
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
        timestamp: lastUpdate
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
                const dayChange = t.todaysChangePerc || 0;
                const volume = t.day?.v || t.min?.av || t.prevDay?.v || 0;
                const price = t.day?.c || t.min?.c || t.prevDay?.c || 0;
                return dayChange > 0 && volume > 500000 && price > 0;
            })
            .sort((a, b) => (b.todaysChangePerc || 0) - (a.todaysChangePerc || 0))
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

                return {
                    symbol: stock.ticker,
                    price: stock.day?.c || stock.min?.c || stock.prevDay?.c || 0,
                    dayChange: stock.todaysChangePerc || 0,
                    volume: stock.day?.v || stock.min?.av || stock.prevDay?.v || 0,
                    dollarVolume: ((stock.day?.c || 0) * (stock.day?.v || 0)).toFixed(0),
                    high: stock.day?.h || stock.prevDay?.h || 0,
                    low: stock.day?.l || stock.prevDay?.l || 0,
                    positionChange,
                    currentRank
                };
            });

            topGainersCache = gainers;
            lastUpdate = Date.now();

            // Broadcast to WebSocket clients
            broadcast({
                type: 'gainers',
                data: gainers,
                timestamp: lastUpdate
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
                    const dayChange = t.todaysChangePerc || 0;
                    const volume = t.day?.v || t.min?.av || t.prevDay?.v || 0;
                    const price = t.day?.c || t.min?.c || t.prevDay?.c || 0;

                    return dayChange >= 1.2 &&
                           volume >= 500000 &&
                           price > 0 &&
                           price <= 500;
                })
                .map(t => ({
                    symbol: t.ticker,
                    price: t.day?.c || t.min?.c || t.prevDay?.c || 0,
                    dayChange: t.todaysChangePerc || 0,
                    volume: t.day?.v || t.min?.av || t.prevDay?.v || 0,
                    dollarVolume: ((t.day?.c || 0) * (t.day?.v || 0)).toFixed(0),
                    high: t.day?.h || t.prevDay?.h || 0,
                    low: t.day?.l || t.prevDay?.l || 0
                }))
                .sort((a, b) => b.dayChange - a.dayChange);

            risingStocksCache = risingStocks;
            return risingStocks;
        }
    } catch (error) {
        console.error('Error fetching rising stocks:', error.message);
    }
    return risingStocksCache;
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

            <a href="/rising" class="scanner-card">
                <h2>📊 Rising Stocks</h2>
                <p>Stocks up 1.2%+ with significant volume activity</p>
                <div class="scanner-stats">
                    <div class="stat">
                        <div class="stat-label">Min Gain</div>
                        <div class="stat-value">+1.2%</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Min Volume</div>
                        <div class="stat-value">500K</div>
                    </div>
                </div>
            </a>

            <a href="/spikes" class="scanner-card">
                <h2>⚡ Spike Detector</h2>
                <p>Advanced spike detection with volume burst analysis</p>
                <div class="scanner-stats">
                    <div class="stat">
                        <div class="stat-label">Detection</div>
                        <div class="stat-value">Real-time</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Analysis</div>
                        <div class="stat-value">Volume</div>
                    </div>
                </div>
            </a>
        </div>

        <div class="api-endpoints">
            <h3>🔌 API Endpoints</h3>
            <div class="endpoint">GET /api/gainers - Get current top gainers</div>
            <div class="endpoint">GET /api/rising - Get rising stocks</div>
            <div class="endpoint">GET /api/spikes - Get spike detection data</div>
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
            <a href="/rising">📊 Rising Stocks</a>
            <a href="/spikes">⚡ Spike Detector</a>
        </div>
        <div id="connection-status">🔴 Connecting...</div>
    </div>

    <h1>🔥 Real-Time Top Gainers</h1>

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
            ws = new WebSocket('ws://localhost:3051');

            ws.onopen = () => {
                console.log('Connected to WebSocket');
                document.getElementById('connection-status').innerHTML = '🟢 Connected';
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'gainers') {
                    allStocks = message.data;
                    updateDisplay();
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
app.get('/rising', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Rising Stocks Scanner</title>
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

        .criteria {
            text-align: center;
            color: #888;
            margin-bottom: 20px;
        }

        button {
            background: linear-gradient(135deg, #00ff41, #00cc33);
            color: black;
            border: none;
            padding: 12px 24px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 5px;
            cursor: pointer;
            display: block;
            margin: 0 auto 30px;
        }

        button:hover {
            box-shadow: 0 5px 15px rgba(0, 255, 65, 0.3);
        }

        #count {
            text-align: center;
            font-size: 1.2em;
            margin-bottom: 20px;
            color: #00ffff;
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

        .high-volume {
            color: #ffd700;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="nav-bar">
        <div class="nav-links">
            <a href="/">🏠 Home</a>
            <a href="/gainers">🔥 Top Gainers</a>
            <a href="/rising" class="active">📊 Rising Stocks</a>
            <a href="/spikes">⚡ Spike Detector</a>
        </div>
    </div>

    <h1>📈 Rising Stocks Scanner</h1>
    <p class="criteria">Showing stocks up 1.2%+ with 500K+ volume</p>
    <button onclick="refresh()">🔄 Refresh</button>
    <div id="count"></div>
    <table>
        <thead>
            <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>Day Change</th>
                <th>Volume</th>
                <th>$ Volume</th>
                <th>Range</th>
            </tr>
        </thead>
        <tbody id="stocksBody"></tbody>
    </table>

    <script>
        async function refresh() {
            const response = await fetch('/api/rising');
            const data = await response.json();

            document.getElementById('count').innerHTML = '<h2>Found ' + data.count + ' stocks</h2>';

            const tbody = document.getElementById('stocksBody');
            tbody.innerHTML = '';

            data.stocks.forEach(stock => {
                const row = tbody.insertRow();
                const volumeClass = stock.volume > 5000000 ? 'high-volume' : '';
                row.innerHTML = \`
                    <td class="symbol">\${stock.symbol}</td>
                    <td>$\${stock.price.toFixed(2)}</td>
                    <td class="positive">+\${stock.dayChange.toFixed(2)}%</td>
                    <td class="\${volumeClass}">\${(stock.volume/1000000).toFixed(1)}M</td>
                    <td>$\${(stock.dollarVolume/1000000).toFixed(1)}M</td>
                    <td>$\${stock.low.toFixed(2)} - $\${stock.high.toFixed(2)}</td>
                \`;
            });
        }

        // Auto-refresh every 10 seconds
        refresh();
        setInterval(refresh, 10000);
    </script>
</body>
</html>
    `);
});

// Spike detector page (placeholder)
app.get('/spikes', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Spike Detector</title>
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

        .content {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            border: 1px solid rgba(0, 255, 65, 0.3);
            text-align: center;
        }

        .coming-soon {
            font-size: 1.5em;
            color: #00ffff;
            margin-bottom: 20px;
        }

        .description {
            color: #888;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="nav-bar">
        <div class="nav-links">
            <a href="/">🏠 Home</a>
            <a href="/gainers">🔥 Top Gainers</a>
            <a href="/rising">📊 Rising Stocks</a>
            <a href="/spikes" class="active">⚡ Spike Detector</a>
        </div>
    </div>

    <h1>⚡ Spike Detector</h1>

    <div class="content">
        <p class="coming-soon">Advanced Spike Detection</p>
        <p class="description">
            Real-time monitoring for volume spikes and unusual trading activity.<br><br>
            Features include volume burst detection, momentum tracking, and automated alerts
            for stocks showing sudden increases in trading activity.
        </p>
    </div>
</body>
</html>
    `);
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

app.get('/api/spikes', (req, res) => {
    res.json({
        success: true,
        message: 'Spike detection endpoint - coming soon',
        spikes: []
    });
});

// Update data every second
setInterval(async () => {
    await getTopGainers();
    console.log(`✅ Updated ${topGainersCache.length} gainers`);
}, 1000);

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
    console.log(`📡 Rising Stocks: http://localhost:${PORT}/rising`);
    console.log(`📡 Spike Detector: http://localhost:${PORT}/spikes`);
    console.log(`📡 WebSocket: ws://localhost:${WS_PORT}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});