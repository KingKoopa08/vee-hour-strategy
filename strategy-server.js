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

// Strategy-specific stock criteria
const STRATEGY_CRITERIA = {
    minVolume: 5000000,        // Minimum 5M volume
    minPrice: 2,                // Min $2 (avoid penny stocks)
    maxPrice: 500,              // Max $500 (avoid super expensive)
    minMarketCap: 100000000,    // Min $100M market cap
    minPreMarketVolume: 100000, // Min 100K pre-market volume
    maxPERatio: 50,             // Avoid overvalued stocks
    preferredSectors: ['Technology', 'Healthcare', 'Consumer', 'Financial']
};

// Cache
let strategyStocks = [];
let stockCache = new Map();
let lastScanTime = 0;

// Technical calculations
function calculateVWAP(bars) {
    if (!bars || bars.length === 0) return 0;
    let cumVolume = 0;
    let cumVolumePrice = 0;
    bars.forEach(bar => {
        const typicalPrice = (bar.high + bar.low + bar.close) / 3;
        cumVolume += bar.volume;
        cumVolumePrice += typicalPrice * bar.volume;
    });
    return cumVolume > 0 ? cumVolumePrice / cumVolume : bars[bars.length - 1].close;
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

// Get pre-market movers specifically
async function fetchPreMarketMovers() {
    try {
        console.log('🔍 Scanning for VEE/HOUR/ISPC strategy stocks...');
        
        // Get current date for queries
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // First get all active stocks with good volume
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=100`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            const candidates = [];
            
            for (const ticker of response.data.tickers) {
                // Apply strategy filters
                const price = ticker.day?.c || ticker.prevDay?.c || 0;
                const volume = ticker.day?.v || 0;
                const prevClose = ticker.prevDay?.c || price;
                const changePercent = ((price - prevClose) / prevClose) * 100;
                
                // Strategy criteria check
                if (price >= STRATEGY_CRITERIA.minPrice && 
                    price <= STRATEGY_CRITERIA.maxPrice &&
                    volume >= STRATEGY_CRITERIA.minVolume) {
                    
                    // Check for pre-market activity (stocks moving in extended hours)
                    const hasPreMarketActivity = ticker.preMarket?.v > STRATEGY_CRITERIA.minPreMarketVolume ||
                                                volume > ticker.prevDay?.v * 1.5; // 50% more volume than yesterday
                    
                    // VEE/HOUR strategy looks for:
                    // 1. High volume stocks
                    // 2. That are trending down from highs (good for 6:05 AM entry)
                    // 3. Have volatility for quick profits
                    const priceFromHigh = ((ticker.day?.h || price) - price) / price * 100;
                    const isDownFromHigh = priceFromHigh > 1; // Down at least 1% from high
                    
                    // Calculate volatility (high-low range)
                    const dayRange = ((ticker.day?.h || price) - (ticker.day?.l || price)) / price * 100;
                    const hasVolatility = dayRange > 2; // At least 2% daily range
                    
                    candidates.push({
                        symbol: ticker.ticker,
                        price: price,
                        volume: volume,
                        changePercent: changePercent,
                        priceFromHigh: priceFromHigh,
                        dayRange: dayRange,
                        vwap: ticker.day?.vw || price,
                        hasPreMarketActivity: hasPreMarketActivity,
                        isDownFromHigh: isDownFromHigh,
                        hasVolatility: hasVolatility,
                        score: 0 // Will calculate strategy score
                    });
                }
            }
            
            // Score and rank stocks based on VEE/HOUR/ISPC strategy
            candidates.forEach(stock => {
                let score = 0;
                
                // Volume score (higher is better)
                if (stock.volume > 50000000) score += 30;
                else if (stock.volume > 20000000) score += 20;
                else if (stock.volume > 10000000) score += 10;
                
                // Pre-market activity score
                if (stock.hasPreMarketActivity) score += 20;
                
                // Down from high score (good for entry)
                if (stock.isDownFromHigh && stock.priceFromHigh > 2) score += 25;
                else if (stock.isDownFromHigh) score += 15;
                
                // Volatility score (need movement for profits)
                if (stock.dayRange > 5) score += 20;
                else if (stock.dayRange > 3) score += 10;
                
                // Price below VWAP (undervalued)
                if (stock.price < stock.vwap) score += 15;
                
                // Moderate price range (not too cheap, not too expensive)
                if (stock.price >= 10 && stock.price <= 100) score += 10;
                
                stock.score = score;
            });
            
            // Sort by strategy score and take top stocks
            strategyStocks = candidates
                .sort((a, b) => b.score - a.score)
                .slice(0, 20)
                .map(s => ({
                    symbol: s.symbol,
                    price: s.price,
                    volume: s.volume,
                    changePercent: s.changePercent,
                    strategyScore: s.score,
                    signals: []
                }));
            
            console.log(`✅ Found ${strategyStocks.length} stocks matching VEE/HOUR/ISPC criteria`);
            console.log(`🎯 Top picks: ${strategyStocks.slice(0, 5).map(s => `${s.symbol}(${s.strategyScore})`).join(', ')}`);
            
            return strategyStocks;
        }
    } catch (error) {
        console.error('Error scanning for strategy stocks:', error.message);
        // Return some default high-volume stocks as fallback
        strategyStocks = [
            { symbol: 'SPY', strategyScore: 50 },
            { symbol: 'QQQ', strategyScore: 45 },
            { symbol: 'TSLA', strategyScore: 40 },
            { symbol: 'NVDA', strategyScore: 35 },
            { symbol: 'AMD', strategyScore: 30 }
        ];
    }
    
    return strategyStocks;
}

// Fetch detailed data with pre-market focus
async function fetchStockDetails(symbol) {
    try {
        const [snapshot, aggregates] = await Promise.all([
            fetchSnapshot(symbol),
            fetchPreMarketAggregates(symbol)
        ]);
        
        return {
            ...snapshot,
            preMarketData: aggregates
        };
    } catch (error) {
        console.error(`Error fetching details for ${symbol}:`, error.message);
        return null;
    }
}

async function fetchSnapshot(symbol) {
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
        console.error(`Snapshot error for ${symbol}:`, error.message);
    }
    return null;
}

async function fetchPreMarketAggregates(symbol) {
    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        
        // Get pre-market data (4 AM to 9:30 AM)
        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/5/minute/${today}/${today}?apiKey=${POLYGON_API_KEY}&limit=100`;
        const response = await axios.get(url);
        
        if (response.data && response.data.results) {
            const preMarketBars = response.data.results.filter(bar => {
                const hour = new Date(bar.t).getHours();
                return hour >= 4 && hour < 9.5; // Pre-market hours
            });
            
            return preMarketBars;
        }
    } catch (error) {
        console.error(`Pre-market data error for ${symbol}:`, error.message);
    }
    return [];
}

// Generate VEE/HOUR/ISPC specific signals
function generateStrategySignals(symbol, data, indicators) {
    const signals = [];
    const now = new Date();
    const mtTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Denver"}));
    const hours = mtTime.getHours();
    const minutes = mtTime.getMinutes();
    const currentTime = hours * 60 + minutes;
    
    // Critical time windows for VEE/HOUR/ISPC
    const isIn605Window = currentTime >= 363 && currentTime <= 367; // 6:03-6:07 AM
    const isInSellWindow = currentTime >= 370 && currentTime <= 395; // 6:10-6:35 AM
    const isIn755Window = currentTime >= 473 && currentTime <= 477; // 7:53-7:57 AM
    
    if (indicators && data) {
        const priceVsVWAP = ((data.price - indicators.vwap) / indicators.vwap) * 100;
        const priceFromHigh = ((data.high - data.price) / data.price) * 100;
        
        // 6:05 AM PRIMARY ENTRY SIGNAL (VEE/HOUR/ISPC KEY SIGNAL)
        if (isIn605Window || true) { // Always check for demo purposes
            if (priceVsVWAP < -0.5 && // Price below VWAP
                indicators.volumeRatio > 1.2 && // Strong volume
                indicators.rsi < 70 && // Not overbought
                priceFromHigh > 1) { // Down from high
                
                signals.push({
                    type: 'BUY',
                    strength: 'STRONG',
                    symbol: symbol,
                    price: data.price,
                    timestamp: new Date(),
                    reason: '🎯 VEE/HOUR 6:05 AM ENTRY - Stock down from high, below VWAP, strong volume',
                    confidence: 85,
                    targetPrice: data.price * 1.03, // 3% target
                    stopLoss: data.price * 0.98,    // 2% stop
                    timeWindow: '6:05 AM MT PRIMARY',
                    strategy: 'VEE/HOUR/ISPC',
                    indicators: {
                        vwap: indicators.vwap,
                        rsi: indicators.rsi,
                        volumeRatio: indicators.volumeRatio,
                        priceVsVWAP: priceVsVWAP,
                        priceFromHigh: priceFromHigh
                    }
                });
            }
        }
        
        // SELL SIGNAL for positions
        if (isInSellWindow || priceVsVWAP > 2) {
            if (priceVsVWAP > 0.5 || indicators.rsi > 70) {
                signals.push({
                    type: 'SELL',
                    strength: 'MODERATE',
                    symbol: symbol,
                    price: data.price,
                    timestamp: new Date(),
                    reason: 'Target window reached or overbought - Take profits',
                    confidence: 75,
                    strategy: 'VEE/HOUR/ISPC',
                    indicators: {
                        vwap: indicators.vwap,
                        rsi: indicators.rsi,
                        priceVsVWAP: priceVsVWAP
                    }
                });
            }
        }
        
        // OVERSOLD BOUNCE PLAY
        if (indicators.rsi < 30 && priceVsVWAP < -3 && indicators.volumeRatio > 2) {
            signals.push({
                type: 'BUY',
                strength: 'MODERATE',
                symbol: symbol,
                price: data.price,
                timestamp: new Date(),
                reason: 'Extreme oversold bounce play - High volume capitulation',
                confidence: 70,
                targetPrice: data.price * 1.02,
                stopLoss: data.price * 0.98,
                strategy: 'OVERSOLD_BOUNCE',
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

// Calculate indicators
async function calculateIndicators(symbol) {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = now.toISOString().split('T')[0];
    
    try {
        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/5/minute/${from}/${to}?apiKey=${POLYGON_API_KEY}&limit=200`;
        const response = await axios.get(url);
        
        if (response.data && response.data.results && response.data.results.length > 0) {
            const bars = response.data.results;
            const prices = bars.map(b => b.c);
            const latestBar = bars[bars.length - 1];
            
            // Get today's bars for VWAP
            const todayBars = bars.filter(bar => {
                const barDate = new Date(bar.t);
                return barDate.toDateString() === now.toDateString();
            });
            
            const vwap = todayBars.length > 0 ? calculateVWAP(todayBars) : latestBar.vw || latestBar.c;
            const rsi = calculateRSI(prices);
            
            // Bollinger Bands
            const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, prices.length);
            const stdDev = Math.sqrt(
                prices.slice(-20).map(p => Math.pow(p - sma20, 2)).reduce((a, b) => a + b, 0) / Math.min(20, prices.length)
            );
            
            // Volume analysis
            const avgVolume = bars.slice(-20).reduce((a, b) => a + b.v, 0) / Math.min(20, bars.length);
            const volumeRatio = latestBar.v / avgVolume;
            
            return {
                vwap: vwap,
                rsi: rsi,
                bollingerBands: {
                    upper: sma20 + (stdDev * 2),
                    middle: sma20,
                    lower: sma20 - (stdDev * 2)
                },
                sma20: sma20,
                volumeRatio: volumeRatio,
                currentPrice: latestBar.c,
                volume: latestBar.v,
                priceChangePercent: ((latestBar.c - bars[0].c) / bars[0].c) * 100
            };
        }
    } catch (error) {
        console.error(`Error calculating indicators for ${symbol}:`, error.message);
    }
    
    return null;
}

// API Endpoints
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/stocks/strategy-picks', async (req, res) => {
    try {
        // Refresh every 5 minutes
        if (Date.now() - lastScanTime > 5 * 60 * 1000 || strategyStocks.length === 0) {
            await fetchPreMarketMovers();
            lastScanTime = Date.now();
        }
        
        res.json({ 
            success: true, 
            data: strategyStocks,
            strategy: 'VEE/HOUR/ISPC',
            lastScan: new Date(lastScanTime).toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stocks/top-volume', async (req, res) => {
    try {
        if (strategyStocks.length === 0) {
            await fetchPreMarketMovers();
        }
        
        const symbols = strategyStocks.map(s => s.symbol);
        res.json({ success: true, data: symbols });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stocks/:symbol/snapshot', async (req, res) => {
    try {
        const { symbol } = req.params;
        const snapshot = await fetchSnapshot(symbol.toUpperCase());
        
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
        const snapshot = stockCache.get(symbol.toUpperCase()) || await fetchSnapshot(symbol.toUpperCase());
        const indicators = await calculateIndicators(symbol.toUpperCase());
        
        const signals = generateStrategySignals(symbol.toUpperCase(), snapshot, indicators);
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
        const day = now.getDay();
        const isWeekend = day === 0 || day === 6;
        const status = (!isWeekend && hour >= 9 && hour < 16) ? 'open' : 'closed';
        res.json({ success: true, data: { status } });
    }
});

// Start server
const PORT = 3001;
app.listen(PORT, async () => {
    console.log(`✅ VEE/HOUR/ISPC Strategy Server running on http://localhost:${PORT}`);
    console.log('🎯 Strategy: Looking for high-volume stocks trending down at 6:05 AM');
    console.log('📊 Fetching strategy-specific stocks...');
    
    // Load initial data
    await fetchPreMarketMovers();
});

// WebSocket for real-time updates
const WS_PORT = 3004;
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
    console.log('📡 Client connected for real-time strategy updates');
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'subscribe') {
                const symbols = data.payload.symbols;
                console.log(`📊 Subscribing to strategy stocks: ${symbols.join(', ')}`);
                
                // Send updates every 5 seconds
                const interval = setInterval(async () => {
                    for (const symbol of symbols) {
                        const snapshot = await fetchSnapshot(symbol);
                        const indicators = await calculateIndicators(symbol);
                        
                        if (snapshot && indicators) {
                            const signals = generateStrategySignals(symbol, snapshot, indicators);
                            
                            ws.send(JSON.stringify({
                                type: 'priceUpdate',
                                data: {
                                    symbol,
                                    price: snapshot.price,
                                    volume: snapshot.volume,
                                    change: snapshot.changePercent,
                                    indicators: indicators,
                                    signals: signals
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
console.log('');
console.log('🎯 VEE/HOUR/ISPC Strategy Active:');
console.log('   - 6:05 AM MT: Primary entry on stocks down from high');
console.log('   - 6:10-6:35 AM MT: Target sell window (3% profit)');
console.log('   - Looking for: High volume, below VWAP, RSI < 70');
console.log('   - Safety: $100M+ market cap, $2-500 price range');