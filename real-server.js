const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Polygon.io configuration
const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Cache for stock data
let stockCache = new Map();
let topVolumeStocks = [];
let lastFetchTime = 0;

// Technical indicator calculations
function calculateVWAP(trades) {
    if (!trades || trades.length === 0) return 0;
    let totalPV = 0;
    let totalVolume = 0;
    trades.forEach(trade => {
        totalPV += trade.price * trade.size;
        totalVolume += trade.size;
    });
    return totalVolume > 0 ? totalPV / totalVolume : trades[trades.length - 1].price;
}

function calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return 50;
    
    let gains = [];
    let losses = [];
    
    for (let i = 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? Math.abs(diff) : 0);
    }
    
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

// Fetch real stock data from Polygon
async function fetchStockSnapshot(symbol) {
    try {
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.ticker) {
            const data = response.data.ticker;
            return {
                symbol: symbol,
                price: data.day?.c || data.prevDay?.c || 0,
                open: data.day?.o || data.prevDay?.o || 0,
                high: data.day?.h || data.prevDay?.h || 0,
                low: data.day?.l || data.prevDay?.l || 0,
                volume: data.day?.v || 0,
                prevClose: data.prevDay?.c || 0,
                change: (data.day?.c || 0) - (data.prevDay?.c || 0),
                changePercent: ((data.day?.c || 0) - (data.prevDay?.c || 0)) / (data.prevDay?.c || 1) * 100,
                vwap: data.day?.vw || 0,
                timestamp: new Date()
            };
        }
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error.message);
    }
    return null;
}

// Fetch top volume stocks
async function fetchTopVolumeStocks() {
    try {
        console.log('📊 Fetching top volume stocks from Polygon...');
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=50`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            // Filter for liquid stocks with reasonable prices
            const filtered = response.data.tickers
                .filter(t => 
                    t.day?.v > 10000000 && // Min 10M volume
                    t.day?.c > 1 && // Price above $1
                    t.day?.c < 1000 // Price below $1000
                )
                .map(t => ({
                    symbol: t.ticker,
                    volume: t.day?.v || 0,
                    price: t.day?.c || 0,
                    change: ((t.day?.c || 0) - (t.prevDay?.c || 0)) / (t.prevDay?.c || 1) * 100
                }))
                .sort((a, b) => b.volume - a.volume)
                .slice(0, 20);
            
            topVolumeStocks = filtered.map(s => s.symbol);
            console.log(`✅ Found ${filtered.length} high-volume stocks`);
            return filtered;
        }
    } catch (error) {
        console.error('Error fetching top volume stocks:', error.message);
        // Fallback to common active stocks
        topVolumeStocks = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL'];
    }
    return topVolumeStocks.map(s => ({ symbol: s }));
}

// Get aggregates for technical analysis
async function fetchAggregates(symbol, from, to) {
    try {
        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/1/minute/${from}/${to}?apiKey=${POLYGON_API_KEY}&limit=500`;
        const response = await axios.get(url);
        
        if (response.data && response.data.results) {
            return response.data.results.map(bar => ({
                time: new Date(bar.t),
                open: bar.o,
                high: bar.h,
                low: bar.l,
                close: bar.c,
                volume: bar.v,
                vwap: bar.vw
            }));
        }
    } catch (error) {
        console.error(`Error fetching aggregates for ${symbol}:`, error.message);
    }
    return [];
}

// Calculate all indicators
async function calculateIndicators(symbol) {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = now.toISOString().split('T')[0];
    
    const aggregates = await fetchAggregates(symbol, from, to);
    
    if (aggregates.length > 0) {
        const prices = aggregates.map(a => a.close);
        const latestBar = aggregates[aggregates.length - 1];
        
        // Calculate VWAP for today's data
        const todayBars = aggregates.filter(a => {
            const barDate = new Date(a.time);
            return barDate.toDateString() === now.toDateString();
        });
        
        let vwap = latestBar.vwap;
        if (todayBars.length > 0) {
            let cumVolume = 0;
            let cumVolumePrice = 0;
            todayBars.forEach(bar => {
                cumVolume += bar.volume;
                cumVolumePrice += bar.close * bar.volume;
            });
            vwap = cumVolume > 0 ? cumVolumePrice / cumVolume : latestBar.close;
        }
        
        // Calculate RSI
        const rsi = calculateRSI(prices);
        
        // Calculate Bollinger Bands
        const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, prices.length);
        const stdDev = Math.sqrt(
            prices.slice(-20).map(p => Math.pow(p - sma20, 2)).reduce((a, b) => a + b, 0) / Math.min(20, prices.length)
        );
        
        // Volume analysis
        const avgVolume = aggregates.slice(-20).reduce((a, b) => a + b.volume, 0) / Math.min(20, aggregates.length);
        const volumeRatio = latestBar.volume / avgVolume;
        
        return {
            vwap: vwap,
            rsi: rsi,
            bollingerBands: {
                upper: sma20 + (stdDev * 2),
                middle: sma20,
                lower: sma20 - (stdDev * 2)
            },
            sma20: sma20,
            ema9: latestBar.close, // Simplified
            volumeRatio: volumeRatio,
            priceChangePercent: ((latestBar.close - aggregates[0].close) / aggregates[0].close) * 100,
            currentPrice: latestBar.close,
            volume: latestBar.volume
        };
    }
    
    return null;
}

// Generate trading signals based on strategy
function generateSignals(symbol, indicators, snapshot) {
    const signals = [];
    const now = new Date();
    const mtTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Denver"}));
    const hours = mtTime.getHours();
    const minutes = mtTime.getMinutes();
    const currentTime = hours * 60 + minutes;
    
    // Check if we're in critical time windows
    const timeWindows = [
        { start: 6 * 60 + 3, end: 6 * 60 + 7, name: "PRIMARY_ENTRY" },
        { start: 6 * 60 + 10, end: 6 * 60 + 35, name: "TARGET_SELL" },
        { start: 6 * 60 + 33, end: 6 * 60 + 37, name: "DIRECTIONAL_BIAS" },
        { start: 7 * 60 + 53, end: 7 * 60 + 57, name: "BREAKOUT" }
    ];
    
    const activeWindow = timeWindows.find(w => currentTime >= w.start && currentTime <= w.end);
    
    if (indicators) {
        const priceVsVWAP = ((indicators.currentPrice - indicators.vwap) / indicators.vwap) * 100;
        
        // 6:05 AM Entry Signal
        if (activeWindow && activeWindow.name === "PRIMARY_ENTRY") {
            if (priceVsVWAP < -0.5 && indicators.volumeRatio > 1.2 && indicators.rsi < 70) {
                signals.push({
                    type: 'BUY',
                    strength: 'STRONG',
                    symbol: symbol,
                    price: indicators.currentPrice,
                    timestamp: new Date(),
                    reason: '6:05 AM Entry - Price below VWAP with strong volume',
                    confidence: 85,
                    targetPrice: indicators.currentPrice * 1.03,
                    stopLoss: indicators.currentPrice * 0.98,
                    timeWindow: '6:05 AM MT',
                    indicators: {
                        vwap: indicators.vwap,
                        rsi: indicators.rsi,
                        volumeRatio: indicators.volumeRatio,
                        priceVsVWAP: priceVsVWAP
                    }
                });
            }
        }
        
        // General signals
        if (indicators.rsi < 30 && priceVsVWAP < -2 && indicators.volumeRatio > 1.5) {
            signals.push({
                type: 'BUY',
                strength: 'MODERATE',
                symbol: symbol,
                price: indicators.currentPrice,
                timestamp: new Date(),
                reason: 'Oversold with high volume below VWAP',
                confidence: 70,
                targetPrice: indicators.currentPrice * 1.02,
                stopLoss: indicators.currentPrice * 0.98,
                indicators: {
                    vwap: indicators.vwap,
                    rsi: indicators.rsi,
                    volumeRatio: indicators.volumeRatio,
                    priceVsVWAP: priceVsVWAP
                }
            });
        }
        
        if (indicators.rsi > 70 && priceVsVWAP > 2) {
            signals.push({
                type: 'SELL',
                strength: 'MODERATE',
                symbol: symbol,
                price: indicators.currentPrice,
                timestamp: new Date(),
                reason: 'Overbought above VWAP',
                confidence: 65,
                indicators: {
                    vwap: indicators.vwap,
                    rsi: indicators.rsi,
                    volumeRatio: indicators.volumeRatio,
                    priceVsVWAP: priceVsVWAP
                }
            });
        }
    }
    
    return signals;
}

// API Endpoints
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/stocks/top-volume', async (req, res) => {
    try {
        // Refresh every 5 minutes
        if (Date.now() - lastFetchTime > 5 * 60 * 1000 || topVolumeStocks.length === 0) {
            await fetchTopVolumeStocks();
            lastFetchTime = Date.now();
        }
        res.json({ success: true, data: topVolumeStocks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stocks/:symbol/snapshot', async (req, res) => {
    try {
        const { symbol } = req.params;
        const snapshot = await fetchStockSnapshot(symbol.toUpperCase());
        
        if (snapshot) {
            stockCache.set(symbol.toUpperCase(), snapshot);
            res.json({ success: true, data: snapshot });
        } else {
            res.status(404).json({ success: false, error: 'Symbol not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stocks/:symbol/indicators', async (req, res) => {
    try {
        const { symbol } = req.params;
        const indicators = await calculateIndicators(symbol.toUpperCase());
        
        if (indicators) {
            res.json({ success: true, data: indicators });
        } else {
            res.status(404).json({ success: false, error: 'No data available' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stocks/:symbol/signals', async (req, res) => {
    try {
        const { symbol } = req.params;
        const indicators = await calculateIndicators(symbol.toUpperCase());
        const snapshot = stockCache.get(symbol.toUpperCase()) || await fetchStockSnapshot(symbol.toUpperCase());
        
        const signals = generateSignals(symbol.toUpperCase(), indicators, snapshot);
        res.json({ success: true, data: signals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/market/status', async (req, res) => {
    try {
        const url = `${POLYGON_BASE_URL}/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        const status = response.data?.market || 'unknown';
        res.json({ success: true, data: { status } });
    } catch (error) {
        const now = new Date();
        const hour = now.getHours();
        const status = (hour >= 9 && hour < 16) ? 'open' : 'closed';
        res.json({ success: true, data: { status } });
    }
});

// Start server
const PORT = 3001;
app.listen(PORT, async () => {
    console.log(`✅ Real Trading Backend running on http://localhost:${PORT}`);
    console.log('🔌 Using live Polygon.io data');
    console.log('📊 Fetching initial market data...');
    
    // Load initial data
    await fetchTopVolumeStocks();
    console.log(`📈 Top volume stocks: ${topVolumeStocks.slice(0, 5).join(', ')}`);
});

// WebSocket for real-time updates
const WS_PORT = 3003;
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
    console.log('📡 Client connected to WebSocket');
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'subscribe') {
                const symbols = data.payload.symbols;
                console.log(`📊 Subscribing to: ${symbols.join(', ')}`);
                
                // Send updates every 5 seconds
                const interval = setInterval(async () => {
                    for (const symbol of symbols) {
                        const snapshot = await fetchStockSnapshot(symbol);
                        const indicators = await calculateIndicators(symbol);
                        
                        if (snapshot && indicators) {
                            ws.send(JSON.stringify({
                                type: 'priceUpdate',
                                data: {
                                    symbol,
                                    price: snapshot.price,
                                    volume: snapshot.volume,
                                    change: snapshot.changePercent,
                                    indicators: indicators,
                                    signals: generateSignals(symbol, indicators, snapshot)
                                },
                                timestamp: new Date().toISOString()
                            }));
                        }
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
        console.log('📡 Client disconnected');
    });
});

console.log(`📡 WebSocket server running on ws://localhost:${WS_PORT}`);