const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3021;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';

// Simple criteria
const CRITERIA = {
    minDayChange: 1.2,  // Minimum 1.2% up today
    minVolume: 500000,  // Minimum 500k volume
    maxPrice: 500       // Max price filter (optional)
};

// Get all stocks meeting criteria
async function getRisingStocks() {
    try {
        console.log('📊 Fetching rising stocks...');
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            const risingStocks = response.data.tickers
                .filter(t => {
                    const dayChange = t.todaysChangePerc || 0;
                    const volume = t.day?.v || t.min?.av || t.prevDay?.v || 0;
                    const price = t.day?.c || t.min?.c || t.prevDay?.c || 0;

                    // Simple filter: up 1.2%+ with 500k+ volume
                    return dayChange >= CRITERIA.minDayChange &&
                           volume >= CRITERIA.minVolume &&
                           price > 0 &&
                           price <= CRITERIA.maxPrice;
                })
                .map(t => ({
                    symbol: t.ticker,
                    price: t.day?.c || t.min?.c || t.prevDay?.c || 0,
                    dayChange: t.todaysChangePerc || 0,
                    volume: t.day?.v || t.min?.av || t.prevDay?.v || 0,
                    dollarVolume: ((t.day?.c || t.min?.c || t.prevDay?.c || 0) * (t.day?.v || t.min?.av || 0)).toFixed(0),
                    high: t.day?.h || t.prevDay?.h || 0,
                    low: t.day?.l || t.prevDay?.l || 0
                }))
                .sort((a, b) => b.dayChange - a.dayChange); // Sort by % gain

            return risingStocks;
        }
    } catch (error) {
        console.error('Error fetching stocks:', error.message);
    }
    return [];
}

// API endpoint
app.get('/api/rising', async (req, res) => {
    const stocks = await getRisingStocks();

    console.log(`\n✅ Found ${stocks.length} stocks up ${CRITERIA.minDayChange}%+ with ${(CRITERIA.minVolume/1000000).toFixed(1)}M+ volume\n`);

    // Show top 10 in console
    if (stocks.length > 0) {
        console.log('Top Rising Stocks:');
        stocks.slice(0, 10).forEach(s => {
            console.log(`  ${s.symbol.padEnd(6)} +${s.dayChange.toFixed(2)}% | $${s.price.toFixed(2)} | Vol: ${(s.volume/1000000).toFixed(1)}M`);
        });
    }

    res.json({
        success: true,
        count: stocks.length,
        criteria: CRITERIA,
        stocks: stocks
    });
});

// Simple HTML page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Rising Stocks Scanner</title>
    <style>
        body { font-family: monospace; background: #0a0a0a; color: #00ff41; padding: 20px; }
        h1 { color: #00ff41; text-shadow: 0 0 10px #00ff41; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border: 1px solid #00ff41; }
        th { background: #001a00; }
        .positive { color: #00ff41; }
        .high-volume { color: #ffff00; }
        button { background: #00ff41; color: black; border: none; padding: 10px 20px; cursor: pointer; font-weight: bold; }
        button:hover { background: #00cc33; }
    </style>
</head>
<body>
    <h1>📈 Rising Stocks Scanner</h1>
    <p>Showing stocks up ${CRITERIA.minDayChange}%+ with ${(CRITERIA.minVolume/1000000).toFixed(1)}M+ volume</p>
    <button onclick="refresh()">🔄 Refresh</button>
    <div id="count"></div>
    <table id="stocks">
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
                row.innerHTML = \`
                    <td><b>\${stock.symbol}</b></td>
                    <td>$\${stock.price.toFixed(2)}</td>
                    <td class="positive">+\${stock.dayChange.toFixed(2)}%</td>
                    <td class="\${stock.volume > 5000000 ? 'high-volume' : ''}">\${(stock.volume/1000000).toFixed(1)}M</td>
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

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 SIMPLE RISING STOCKS SCANNER`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 Web Interface: http://localhost:${PORT}`);
    console.log(`📡 API Endpoint: http://localhost:${PORT}/api/rising`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(`Criteria: Up ${CRITERIA.minDayChange}%+ with ${(CRITERIA.minVolume/1000000).toFixed(1)}M+ volume\n`);
});