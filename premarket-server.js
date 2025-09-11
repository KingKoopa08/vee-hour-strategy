const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the live-dashboard.html file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'live-dashboard.html'));
});

// Polygon.io configuration
const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Cache
let topStocks = [];
let stockCache = new Map();

// Get the most recent trading day  
function getLastTradingDay() {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    
    // If it's a weekday and after 4 AM ET, use today
    // Otherwise use the most recent trading day
    if (day >= 1 && day <= 5 && hour >= 4) {
        return now.toISOString().split('T')[0];
    }
    
    // For weekends or early morning, get the last Friday
    const daysToSubtract = day === 0 ? 2 : day === 6 ? 1 : 0;
    now.setDate(now.getDate() - daysToSubtract);
    return now.toISOString().split('T')[0];
}

// Fetch snapshot with fallback to previous day
async function fetchSnapshot(symbol) {
    try {
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.ticker) {
            const ticker = response.data.ticker;
            
            // Use prevDay data if day data is not available (weekend/after-hours)
            const dayData = ticker.day || ticker.prevDay || {};
            const price = dayData.c || ticker.min?.c || ticker.prevDay?.c || 0;
            
            return {
                symbol: symbol,
                price: price,
                open: dayData.o || 0,
                high: dayData.h || 0,
                low: dayData.l || 0,
                volume: dayData.v || 0,
                prevClose: ticker.prevDay?.c || 0,
                change: price - (ticker.prevDay?.c || price),
                changePercent: ((price - (ticker.prevDay?.c || price)) / (ticker.prevDay?.c || 1)) * 100,
                vwap: dayData.vw || price,
                timestamp: new Date(),
                updated: ticker.updated || Date.now(),
                preMarket: ticker.preMarket || null,
                afterHours: ticker.afterHours || null
            };
        }
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error.message);
    }
    return null;
}

// Get top gainers/most active stocks using live snapshots
async function fetchTopStocks() {
    try {
        console.log('📊 Fetching live most active stocks from market...');
        
        // Use the snapshot endpoint to get live data for all tickers - fetch max to analyze
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=1000`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            // Filter and sort by volume using live snapshot data
            const stocks = response.data.tickers
                .filter(t => {
                    // For pre-market, check preMarket data first, then regular hours
                    const preMarketPrice = t.preMarket?.c || 0;
                    const regularPrice = t.day?.c || t.prevDay?.c || 0;
                    const price = preMarketPrice || regularPrice;
                    
                    // Get pre-market volume or regular volume
                    const preMarketVolume = t.preMarket?.v || 0;
                    const regularVolume = t.day?.v || t.prevDay?.v || 0;
                    const volume = preMarketVolume || regularVolume;
                    
                    return volume > 100000 && // Lower threshold for pre-market (100k)
                           price > 0.5 &&       // Price > $0.50 
                           price < 2000;        // Price < $2000
                })
                .map(t => {
                    // Get pre-market data if available, otherwise use regular hours
                    const preMarketPrice = t.preMarket?.c || 0;
                    const preMarketVolume = t.preMarket?.v || 0;
                    const preMarketHigh = t.preMarket?.h || 0;
                    const preMarketLow = t.preMarket?.l || 0;
                    const preMarketVWAP = t.preMarket?.vw || 0;
                    
                    // Use pre-market data if available, otherwise regular hours
                    const currentPrice = preMarketPrice || t.day?.c || t.prevDay?.c || 0;
                    const previousClose = t.prevDay?.c || 0;
                    const volume = preMarketVolume || t.day?.v || t.prevDay?.v || 0;
                    
                    // Calculate price change from previous close
                    let priceChange = 0;
                    let changePercent = 0;
                    
                    if (previousClose > 0 && currentPrice > 0) {
                        priceChange = currentPrice - previousClose;
                        changePercent = (priceChange / previousClose) * 100;
                    }
                    
                    return {
                        symbol: t.ticker,
                        price: currentPrice,
                        volume: volume,
                        change: priceChange,
                        changePercent: changePercent,
                        high: preMarketHigh || t.day?.h || t.prevDay?.h || 0,
                        low: preMarketLow || t.day?.l || t.prevDay?.l || 0,
                        vwap: preMarketVWAP || t.day?.vw || t.prevDay?.vw || currentPrice,
                        isPreMarket: preMarketVolume > 0
                    };
                })
                .sort((a, b) => b.volume - a.volume) // Sort by highest volume
                .slice(0, 500); // Get top 500 by volume
            
            topStocks = stocks.map(s => s.symbol);
            console.log(`✅ Found ${stocks.length} active stocks with live data`);
            console.log(`📈 Top 5 by volume: ${topStocks.slice(0, 5).join(', ')}`);
            
            // Cache the data
            stocks.forEach(s => {
                stockCache.set(s.symbol, s);
            });
            
            return stocks;
        }
        
        // If no data, return common active stocks
        console.log('⚠️ No live snapshot data available, using defaults');
        topStocks = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL'];
        return topStocks.map(s => ({ symbol: s }));
        
    } catch (error) {
        console.error('Error fetching top stocks:', error.message);
        // Fallback to most common active stocks
        topStocks = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL'];
        return topStocks.map(s => ({ symbol: s }));
    }
}

// Calculate indicators using recent data
async function calculateIndicators(symbol) {
    try {
        const now = new Date();
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 5); // Get 5 days of data
        
        const from = fromDate.toISOString().split('T')[0];
        const to = now.toISOString().split('T')[0];
        
        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/5/minute/${from}/${to}?apiKey=${POLYGON_API_KEY}&limit=500`;
        const response = await axios.get(url);
        
        if (response.data && response.data.results && response.data.results.length > 0) {
            const bars = response.data.results;
            const prices = bars.map(b => b.c);
            const latestBar = bars[bars.length - 1];
            
            // Calculate VWAP for today's data
            const today = new Date().toISOString().split('T')[0];
            const lastDayBars = bars.filter(bar => {
                const barDate = new Date(bar.t);
                return barDate.toISOString().split('T')[0] === today;
            });
            
            let vwap = latestBar.vw || latestBar.c;
            if (lastDayBars.length > 0) {
                let cumVolume = 0;
                let cumVolumePrice = 0;
                lastDayBars.forEach(bar => {
                    const typicalPrice = (bar.h + bar.l + bar.c) / 3;
                    cumVolume += bar.v;
                    cumVolumePrice += typicalPrice * bar.v;
                });
                vwap = cumVolume > 0 ? cumVolumePrice / cumVolume : latestBar.c;
            }
            
            // Calculate RSI
            const rsi = calculateRSI(prices);
            
            // Calculate Bollinger Bands
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
    
    // Return default values if no data
    return {
        vwap: stockCache.get(symbol)?.vwap || 0,
        rsi: 50,
        bollingerBands: { upper: 0, middle: 0, lower: 0 },
        sma20: 0,
        volumeRatio: 1,
        currentPrice: stockCache.get(symbol)?.price || 0,
        volume: stockCache.get(symbol)?.volume || 0,
        priceChangePercent: 0
    };
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

// Calculate strategy score for stock ranking
function calculateStrategyScore(snapshot, indicators) {
    if (!snapshot || !indicators) return 0;
    
    let score = 0;
    const priceVsVWAP = ((snapshot.price - indicators.vwap) / indicators.vwap) * 100;
    const priceFromHigh = snapshot.high ? ((snapshot.high - snapshot.price) / snapshot.high) * 100 : 0;
    
    // 1. Below VWAP (critical indicator) - max 30 points
    if (priceVsVWAP < 0) {
        score += Math.min(30, Math.abs(priceVsVWAP) * 10);
    }
    
    // 2. Down from high (trending down) - max 25 points
    if (priceFromHigh > 0) {
        score += Math.min(25, priceFromHigh * 2.5);
    }
    
    // 3. Volume ratio (liquidity) - max 20 points
    if (indicators.volumeRatio > 1) {
        score += Math.min(20, indicators.volumeRatio * 10);
    }
    
    // 4. RSI not overbought - max 15 points
    if (indicators.rsi < 70 && indicators.rsi > 30) {
        score += 15 - Math.abs(50 - indicators.rsi) * 0.3;
    } else if (indicators.rsi <= 30) {
        score += 15; // Oversold bonus
    }
    
    // 5. Price change momentum - max 10 points
    if (indicators.priceChangePercent < 0 && indicators.priceChangePercent > -10) {
        score += Math.abs(indicators.priceChangePercent);
    }
    
    return score;
}

// Generate signals based on VEE/HOUR strategy
function generateSignals(symbol, snapshot, indicators) {
    const signals = [];
    
    if (!snapshot || !indicators) return signals;
    
    const priceVsVWAP = ((snapshot.price - indicators.vwap) / indicators.vwap) * 100;
    const priceFromHigh = snapshot.high ? ((snapshot.high - snapshot.price) / snapshot.high) * 100 : 0;
    const score = calculateStrategyScore(snapshot, indicators);
    
    // VEE/HOUR 6:05 AM Signal conditions
    if (priceVsVWAP < -0.5 && // Below VWAP
        indicators.volumeRatio > 1.2 && // Good volume
        indicators.rsi < 70 && // Not overbought
        priceFromHigh > 0.5) { // Down from high
        
        signals.push({
            type: 'BUY',
            strength: 'STRONG',
            symbol: symbol,
            price: snapshot.price,
            timestamp: new Date(),
            reason: '📍 VEE/HOUR Signal: Stock below VWAP, down from high, good volume',
            confidence: Math.min(95, 50 + score * 0.5),
            targetPrice: snapshot.price * 1.03,
            stopLoss: snapshot.price * 0.98,
            timeWindow: '6:05 AM Entry',
            strategyScore: score,
            indicators: {
                vwap: indicators.vwap,
                rsi: indicators.rsi,
                volumeRatio: indicators.volumeRatio,
                priceVsVWAP: priceVsVWAP,
                priceFromHigh: priceFromHigh
            }
        });
    }
    
    // Oversold bounce
    if (indicators.rsi < 30 && priceVsVWAP < -2) {
        signals.push({
            type: 'BUY',
            strength: 'MODERATE',
            symbol: symbol,
            price: snapshot.price,
            timestamp: new Date(),
            reason: 'Oversold bounce opportunity',
            confidence: 65,
            targetPrice: snapshot.price * 1.02,
            stopLoss: snapshot.price * 0.98,
            indicators: {
                vwap: indicators.vwap,
                rsi: indicators.rsi,
                volumeRatio: indicators.volumeRatio,
                priceVsVWAP: priceVsVWAP
            }
        });
    }
    
    // Overbought warning
    if (indicators.rsi > 70 && priceVsVWAP > 2) {
        signals.push({
            type: 'SELL',
            strength: 'MODERATE',
            symbol: symbol,
            price: snapshot.price,
            timestamp: new Date(),
            reason: 'Overbought - Consider taking profits',
            confidence: 70,
            indicators: {
                vwap: indicators.vwap,
                rsi: indicators.rsi,
                volumeRatio: indicators.volumeRatio,
                priceVsVWAP: priceVsVWAP
            }
        });
    }
    
    return signals;
}

// API Endpoints
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/stocks/top-volume', async (req, res) => {
    try {
        const stocks = await fetchTopStocks();
        // Return in the format the dashboard expects
        const formattedStocks = stocks
            .filter(stock => stock.volume > 0) // Filter out stocks with no volume
            .sort((a, b) => b.volume - a.volume) // Sort by highest volume first
            .slice(0, 20) // Get top 20 highest volume stocks
            .map((stock, index) => {
                if (typeof stock === 'string') {
                    // If we only have symbols, return minimal data
                    const cachedData = stockCache.get(stock);
                    return {
                        rank: index + 1,
                        symbol: stock,
                        companyName: stock,
                        price: cachedData?.price || 0,
                        priceChange: cachedData?.change || 0,
                        priceChangePercent: cachedData?.changePercent || 0,
                        volume: cachedData?.volume || 0,
                        volumeRatio: 1.0,
                        vwap: cachedData?.vwap || 0,
                        momentum: 'neutral',
                        volumeSurge: false,
                        signal: 'HOLD',
                        news: null,
                        mnavScore: 50,
                        updateTime: new Date().toLocaleTimeString('en-US')
                    };
                }
                // If we have full stock objects, format them properly
                // Fix the price change calculation
                const priceChange = stock.change || 0;
                const priceChangePercent = isFinite(stock.changePercent) ? stock.changePercent : 0;
                
                // Determine signal based on actual data
                let signal = 'HOLD';
                if (priceChangePercent > 3) signal = 'BUY';
                else if (priceChangePercent < -3) signal = 'SELL';
                
                // Determine momentum
                let momentum = 'neutral';
                if (priceChangePercent > 1) momentum = 'bullish';
                else if (priceChangePercent < -1) momentum = 'bearish';
                
                return {
                    rank: index + 1,
                    symbol: stock.symbol,
                    companyName: stock.symbol,
                    price: stock.price || 0,
                    priceChange: priceChange,
                    priceChangePercent: priceChangePercent,
                    volume: stock.volume || 0,
                    volumeRatio: 1.0,
                    vwap: stock.vwap || stock.price || 0,
                    momentum: momentum,
                    volumeSurge: stock.volume > 10000000,
                    signal: signal,
                    news: null,
                    mnavScore: Math.min(100, 50 + (stock.volume / 1000000)),
                    updateTime: new Date().toLocaleTimeString('en-US')
                };
            });
        res.json({ success: true, stocks: formattedStocks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stocks/:symbol/snapshot', async (req, res) => {
    try {
        const { symbol } = req.params;
        const snapshot = await fetchSnapshot(symbol.toUpperCase());
        
        if (snapshot) {
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
        res.json({ success: true, data: indicators });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stocks/:symbol/signals', async (req, res) => {
    try {
        const { symbol } = req.params;
        const snapshot = await fetchSnapshot(symbol.toUpperCase());
        const indicators = await calculateIndicators(symbol.toUpperCase());
        const signals = generateSignals(symbol.toUpperCase(), snapshot, indicators);
        res.json({ success: true, data: signals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/market/status', async (req, res) => {
    try {
        const url = `${POLYGON_BASE_URL}/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        res.json({ success: true, data: { status: response.data?.market || 'unknown' } });
    } catch (error) {
        res.json({ success: true, data: { status: 'extended-hours' } });
    }
});

// Get best stocks based on strategy scoring
app.get('/api/stocks/best-opportunities', async (req, res) => {
    try {
        console.log('🎯 Analyzing all stocks for best VEE/HOUR opportunities...');
        
        // Ensure we have stocks loaded
        if (topStocks.length === 0) {
            await fetchTopStocks();
        }
        
        const stockAnalysis = [];
        
        // Analyze each stock
        for (const symbol of topStocks) {
            const snapshot = await fetchSnapshot(symbol);
            const indicators = await calculateIndicators(symbol);
            
            if (snapshot && indicators) {
                const score = calculateStrategyScore(snapshot, indicators);
                const signals = generateSignals(symbol, snapshot, indicators);
                
                const priceVsVWAP = ((snapshot.price - indicators.vwap) / indicators.vwap) * 100;
                const priceFromHigh = snapshot.high ? ((snapshot.high - snapshot.price) / snapshot.high) * 100 : 0;
                
                stockAnalysis.push({
                    symbol: symbol,
                    score: score,
                    price: snapshot.price,
                    volume: snapshot.volume,
                    changePercent: snapshot.changePercent,
                    indicators: {
                        vwap: indicators.vwap,
                        rsi: indicators.rsi,
                        volumeRatio: indicators.volumeRatio,
                        priceVsVWAP: priceVsVWAP,
                        priceFromHigh: priceFromHigh
                    },
                    signals: signals,
                    analysis: {
                        belowVWAP: priceVsVWAP < 0,
                        downFromHigh: priceFromHigh > 1,
                        goodVolume: indicators.volumeRatio > 1.2,
                        notOverbought: indicators.rsi < 70,
                        meetsAllCriteria: priceVsVWAP < -0.5 && priceFromHigh > 0.5 && 
                                         indicators.volumeRatio > 1.2 && indicators.rsi < 70
                    }
                });
            }
        }
        
        // Sort by score (highest first)
        stockAnalysis.sort((a, b) => b.score - a.score);
        
        // Get top opportunities - show top 10 best and next 10 as watchlist
        const topOpportunities = stockAnalysis.slice(0, 10);
        const watchList = stockAnalysis.slice(10, 20);
        
        console.log('✅ Top opportunities:');
        topOpportunities.forEach((s, i) => {
            console.log(`  ${i + 1}. ${s.symbol} - Score: ${s.score.toFixed(1)}, ` +
                       `VWAP: ${s.indicators.priceVsVWAP.toFixed(2)}%, ` +
                       `From High: ${s.indicators.priceFromHigh.toFixed(2)}%`);
        });
        
        res.json({
            success: true,
            data: {
                topOpportunities: topOpportunities,
                watchList: watchList,
                totalAnalyzed: stockAnalysis.length,
                timestamp: new Date(),
                criteria: {
                    strategy: 'VEE/HOUR/ISPC',
                    requirements: [
                        'Price below VWAP',
                        'Trending down from daily high',
                        'Volume > 1.2x average',
                        'RSI < 70 (not overbought)',
                        'Target: 3% gain at 6:35 AM'
                    ]
                }
            }
        });
    } catch (error) {
        console.error('Error analyzing stocks:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
const PORT = 3011;
app.listen(PORT, async () => {
    console.log(`✅ Pre-Market Strategy Server running on http://localhost:${PORT}`);
    console.log('🎯 VEE/HOUR/ISPC Strategy Active with Live Market Data');
    console.log('📊 Loading current most active stocks from live market...');
    
    // Load initial data
    await fetchTopStocks();
});

// WebSocket for real-time updates
const WS_PORT = 3006;
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
    console.log('📡 Client connected');
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'subscribe') {
                const symbols = data.payload.symbols;
                console.log(`📊 Subscribing to: ${symbols.join(', ')}`);
                
                // Send immediate data
                for (const symbol of symbols) {
                    const snapshot = await fetchSnapshot(symbol);
                    const indicators = await calculateIndicators(symbol);
                    const signals = generateSignals(symbol, snapshot, indicators);
                    
                    if (snapshot) {
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
                
                // Then send updates periodically
                const interval = setInterval(async () => {
                    for (const symbol of symbols) {
                        const snapshot = await fetchSnapshot(symbol);
                        const indicators = await calculateIndicators(symbol);
                        const signals = generateSignals(symbol, snapshot, indicators);
                        
                        if (snapshot) {
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
                }, 10000); // Update every 10 seconds
                
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

console.log(`📡 WebSocket running on ws://localhost:${WS_PORT}`);