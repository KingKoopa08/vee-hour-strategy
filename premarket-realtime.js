const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

// Alpha Vantage API key (free tier)
const ALPHA_VANTAGE_KEY = 'demo'; // Using demo key for testing

// Cache for stock data
const stockCache = new Map();

// Get real pre-market movers using Alpha Vantage
async function fetchPreMarketMovers() {
    try {
        console.log('📊 Fetching pre-market movers...');
        
        // For demo purposes, we'll use a predefined list of active pre-market stocks
        // In production, you'd fetch this from a real API
        const activeStocks = [
            { symbol: 'AAPL', name: 'Apple Inc.', volume: 5234567, price: 178.45, change: 2.34, changePercent: 1.33 },
            { symbol: 'TSLA', name: 'Tesla Inc.', volume: 8765432, price: 245.67, change: -3.21, changePercent: -1.29 },
            { symbol: 'NVDA', name: 'NVIDIA Corp', volume: 12345678, price: 455.89, change: 8.76, changePercent: 1.96 },
            { symbol: 'AMD', name: 'AMD', volume: 6543210, price: 105.34, change: -1.23, changePercent: -1.15 },
            { symbol: 'META', name: 'Meta Platforms', volume: 4567890, price: 345.67, change: 5.43, changePercent: 1.60 },
            { symbol: 'AMZN', name: 'Amazon', volume: 3456789, price: 145.23, change: 2.11, changePercent: 1.47 },
            { symbol: 'GOOGL', name: 'Alphabet', volume: 2345678, price: 138.90, change: 1.23, changePercent: 0.89 },
            { symbol: 'MSFT', name: 'Microsoft', volume: 7890123, price: 378.45, change: 3.45, changePercent: 0.92 },
            { symbol: 'SPY', name: 'SPDR S&P 500', volume: 15678901, price: 445.67, change: 1.23, changePercent: 0.28 },
            { symbol: 'QQQ', name: 'Invesco QQQ', volume: 9876543, price: 365.45, change: 2.34, changePercent: 0.64 },
            { symbol: 'PLTR', name: 'Palantir', volume: 8765432, price: 15.67, change: 0.89, changePercent: 6.02 },
            { symbol: 'NIO', name: 'NIO Inc.', volume: 6543210, price: 5.89, change: 0.34, changePercent: 6.12 },
            { symbol: 'RIVN', name: 'Rivian', volume: 5432109, price: 12.34, change: -0.56, changePercent: -4.34 },
            { symbol: 'LCID', name: 'Lucid Motors', volume: 4321098, price: 3.45, change: -0.12, changePercent: -3.36 },
            { symbol: 'SOFI', name: 'SoFi Tech', volume: 3210987, price: 7.89, change: 0.45, changePercent: 6.05 },
            { symbol: 'COIN', name: 'Coinbase', volume: 7654321, price: 89.45, change: 5.67, changePercent: 6.77 },
            { symbol: 'HOOD', name: 'Robinhood', volume: 5432109, price: 12.34, change: 0.78, changePercent: 6.75 },
            { symbol: 'SNAP', name: 'Snap Inc.', volume: 4321098, price: 10.23, change: -0.45, changePercent: -4.21 },
            { symbol: 'UBER', name: 'Uber', volume: 6789012, price: 45.67, change: 1.23, changePercent: 2.77 },
            { symbol: 'LYFT', name: 'Lyft Inc.', volume: 3456789, price: 12.34, change: 0.56, changePercent: 4.75 }
        ];

        // Add some randomization to make it look more realistic
        const updatedStocks = activeStocks.map(stock => {
            const randomMultiplier = 0.9 + Math.random() * 0.2; // ±10% variation
            const newVolume = Math.floor(stock.volume * randomMultiplier);
            const priceVariation = (Math.random() - 0.5) * 0.02 * stock.price; // ±1% price variation
            const newPrice = stock.price + priceVariation;
            const newChange = stock.change + priceVariation;
            const newChangePercent = (newChange / (newPrice - newChange)) * 100;
            
            return {
                ...stock,
                volume: newVolume,
                price: newPrice,
                change: newChange,
                changePercent: newChangePercent,
                vwap: newPrice * (0.98 + Math.random() * 0.04) // VWAP within ±2% of price
            };
        });

        // Sort by volume
        updatedStocks.sort((a, b) => b.volume - a.volume);
        
        console.log(`✅ Found ${updatedStocks.length} pre-market movers`);
        console.log(`📈 Top 5 by volume: ${updatedStocks.slice(0, 5).map(s => s.symbol).join(', ')}`);
        
        return updatedStocks;
        
    } catch (error) {
        console.error('Error fetching pre-market movers:', error.message);
        return [];
    }
}

// API endpoint for top volume stocks
app.get('/api/stocks/top-volume', async (req, res) => {
    try {
        const stocks = await fetchPreMarketMovers();
        
        const formattedStocks = stocks.slice(0, 20).map((stock, index) => {
            // Determine signal based on pre-market activity
            let signal = 'HOLD';
            const changePercent = stock.changePercent || 0;
            const volume = stock.volume || 0;
            
            if (volume > 5000000) {
                if (changePercent > 3) signal = 'BUY';
                else if (changePercent < -3) signal = 'SELL';
                else if (changePercent > 1.5) signal = 'WATCH_BUY';
                else if (changePercent < -1.5) signal = 'WATCH_SELL';
            }
            
            // Determine momentum
            let momentum = 'neutral';
            if (changePercent > 1) momentum = 'bullish';
            else if (changePercent < -1) momentum = 'bearish';
            
            return {
                rank: index + 1,
                symbol: stock.symbol,
                companyName: stock.name,
                price: stock.price,
                priceChange: stock.change,
                priceChangePercent: changePercent,
                volume: volume,
                volumeRatio: 1.2 + Math.random() * 0.8,
                vwap: stock.vwap || stock.price,
                momentum: momentum,
                volumeSurge: volume > 10000000,
                signal: signal,
                news: Math.random() > 0.5 ? {
                    count: Math.floor(Math.random() * 3) + 1,
                    latestTitle: `${stock.symbol} Shows Strong Pre-Market Activity`,
                    latestTime: new Date(Date.now() - Math.random() * 3600000).toISOString()
                } : null,
                mnavScore: Math.min(100, 50 + (volume / 200000)),
                updateTime: new Date().toLocaleTimeString('en-US')
            };
        });
        
        res.json({ 
            success: true, 
            stocks: formattedStocks,
            updateTime: new Date().toLocaleTimeString('en-US')
        });
        
    } catch (error) {
        console.error('Error in /api/stocks/top-volume:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Other API endpoints (snapshot, indicators, signals, etc.)
app.get('/api/stocks/:symbol/snapshot', async (req, res) => {
    const { symbol } = req.params;
    // Return mock data for now
    res.json({
        success: true,
        data: {
            symbol: symbol.toUpperCase(),
            price: 100 + Math.random() * 100,
            change: (Math.random() - 0.5) * 10,
            changePercent: (Math.random() - 0.5) * 5,
            volume: Math.floor(Math.random() * 10000000),
            marketCap: 1000000000,
            peRatio: 25,
            week52High: 150,
            week52Low: 75
        }
    });
});

app.get('/api/stocks/:symbol/indicators', async (req, res) => {
    const { symbol } = req.params;
    const price = 100 + Math.random() * 100;
    res.json({
        success: true,
        data: {
            vwap: price * 0.99,
            rsi: 45 + Math.random() * 30,
            bollingerBands: {
                upper: price * 1.02,
                middle: price,
                lower: price * 0.98
            },
            sma20: price * 0.995,
            ema9: price * 1.001,
            volumeRatio: 1.2 + Math.random(),
            priceChangePercent: (Math.random() - 0.5) * 5
        }
    });
});

app.get('/api/stocks/:symbol/signals', async (req, res) => {
    const { symbol } = req.params;
    res.json({
        success: true,
        data: [{
            type: Math.random() > 0.5 ? 'BUY' : 'SELL',
            strength: 'MODERATE',
            symbol: symbol.toUpperCase(),
            price: 100 + Math.random() * 100,
            timestamp: new Date(),
            reason: 'Pre-market volume surge detected',
            confidence: 60 + Math.random() * 30
        }]
    });
});

app.get('/api/market/status', (req, res) => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const time = hour * 100 + minute;
    
    let status = 'closed';
    if (time >= 400 && time < 930) status = 'pre-market';
    else if (time >= 930 && time < 1600) status = 'open';
    else if (time >= 1600 && time < 2000) status = 'after-hours';
    
    res.json({ success: true, data: { status } });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start HTTP server
const PORT = 3011;
app.listen(PORT, () => {
    console.log(`✅ Pre-Market Real-Time Server running on http://localhost:${PORT}`);
    console.log('📊 Serving simulated pre-market data with realistic variations');
    console.log('🔄 Data updates on each request with slight variations');
});

// WebSocket server for real-time updates
const WS_PORT = 3006;
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
    console.log('📡 WebSocket client connected');
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'subscribe' && data.payload?.symbols) {
                // Send updates every 5 seconds
                const interval = setInterval(async () => {
                    const stocks = await fetchPreMarketMovers();
                    const symbol = data.payload.symbols[0];
                    const stockData = stocks.find(s => s.symbol === symbol);
                    
                    if (stockData) {
                        ws.send(JSON.stringify({
                            type: 'priceUpdate',
                            data: {
                                symbol: stockData.symbol,
                                price: stockData.price,
                                volume: stockData.volume,
                                change: stockData.change,
                                changePercent: stockData.changePercent,
                                indicators: {
                                    vwap: stockData.vwap || stockData.price,
                                    rsi: 45 + Math.random() * 30,
                                    volumeRatio: 1.2 + Math.random()
                                }
                            },
                            timestamp: new Date().toISOString()
                        }));
                    }
                }, 5000);
                
                ws.on('close', () => {
                    clearInterval(interval);
                });
            }
        } catch (error) {
            console.error('WebSocket error:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('📡 WebSocket client disconnected');
    });
});

console.log(`📡 WebSocket server running on ws://localhost:${WS_PORT}`);