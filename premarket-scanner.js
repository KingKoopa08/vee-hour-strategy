const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the premarket scanner dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'premarket-scanner.html'));
});

// Polygon.io configuration
const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Cache for pre-market data
let premarketCache = new Map();
let lastUpdateTime = null;
let topPremarketStocks = [];

// Helper to check if market is in pre-market hours (4:00 AM - 9:30 AM ET)
function isPremarketHours() {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const hours = easternTime.getHours();
    const minutes = easternTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    // Pre-market: 4:00 AM (240) to 9:30 AM (570) ET
    return totalMinutes >= 240 && totalMinutes < 570;
}

// Calculate technical indicators
function calculateTechnicals(data) {
    if (!data || !data.price) return {};
    
    const price = data.price;
    const prevClose = data.prevClose || price;
    const volume = data.volume || 0;
    const avgVolume = data.avgVolume || volume;
    
    // Price movement
    const priceChange = price - prevClose;
    const priceChangePercent = (priceChange / prevClose) * 100;
    
    // Volume analysis
    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 0;
    const unusualVolume = volumeRatio > 2;
    
    // Gap analysis
    const gapPercent = ((data.open - prevClose) / prevClose) * 100;
    const gapType = gapPercent > 2 ? 'GAP_UP' : gapPercent < -2 ? 'GAP_DOWN' : 'NO_GAP';
    
    // Price range
    const dayRange = data.high - data.low;
    const rangePercent = (dayRange / price) * 100;
    
    // Position in range
    const positionInRange = dayRange > 0 ? ((price - data.low) / dayRange) * 100 : 50;
    
    return {
        priceChange,
        priceChangePercent,
        volumeRatio,
        unusualVolume,
        gapPercent,
        gapType,
        rangePercent,
        positionInRange,
        momentum: priceChangePercent > 0 ? 'BULLISH' : priceChangePercent < 0 ? 'BEARISH' : 'NEUTRAL'
    };
}

// Calculate strategy score for pre-market picks
function calculateStrategyScore(stock) {
    let score = 0;
    let reasons = [];
    
    // Volume score (0-25 points)
    if (stock.volumeRatio > 5) {
        score += 25;
        reasons.push('Exceptional volume (5x+)');
    } else if (stock.volumeRatio > 3) {
        score += 20;
        reasons.push('Very high volume (3x+)');
    } else if (stock.volumeRatio > 2) {
        score += 15;
        reasons.push('High volume (2x+)');
    } else if (stock.volumeRatio > 1.5) {
        score += 10;
        reasons.push('Above average volume');
    }
    
    // Gap score (0-20 points)
    const gapAbs = Math.abs(stock.gapPercent || 0);
    if (gapAbs > 5) {
        score += 20;
        reasons.push(`Strong gap ${stock.gapType === 'GAP_UP' ? 'up' : 'down'} (${gapAbs.toFixed(1)}%)`);
    } else if (gapAbs > 3) {
        score += 15;
        reasons.push(`Moderate gap (${gapAbs.toFixed(1)}%)`);
    } else if (gapAbs > 1) {
        score += 10;
        reasons.push(`Small gap (${gapAbs.toFixed(1)}%)`);
    }
    
    // Price movement score (0-20 points)
    const priceMove = Math.abs(stock.priceChangePercent || 0);
    if (priceMove > 10) {
        score += 20;
        reasons.push(`Strong price move (${priceMove.toFixed(1)}%)`);
    } else if (priceMove > 5) {
        score += 15;
        reasons.push(`Moderate price move (${priceMove.toFixed(1)}%)`);
    } else if (priceMove > 2) {
        score += 10;
        reasons.push(`Active price movement`);
    }
    
    // Range and volatility (0-15 points)
    if (stock.rangePercent > 5) {
        score += 15;
        reasons.push('High volatility range');
    } else if (stock.rangePercent > 3) {
        score += 10;
        reasons.push('Good trading range');
    } else if (stock.rangePercent > 1) {
        score += 5;
        reasons.push('Normal range');
    }
    
    // Price position (0-10 points)
    if (stock.positionInRange > 80) {
        score += 10;
        reasons.push('Near high of range');
    } else if (stock.positionInRange < 20) {
        score += 10;
        reasons.push('Near low of range');
    } else {
        score += 5;
        reasons.push('Mid-range');
    }
    
    // Liquidity bonus (0-10 points)
    if (stock.volume > 5000000) {
        score += 10;
        reasons.push('Excellent liquidity');
    } else if (stock.volume > 2000000) {
        score += 7;
        reasons.push('Good liquidity');
    } else if (stock.volume > 1000000) {
        score += 5;
        reasons.push('Adequate liquidity');
    }
    
    return {
        score: Math.min(100, score),
        reasons,
        grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F'
    };
}

// Fetch pre-market data for a single stock
async function fetchPremarketData(symbol) {
    try {
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.ticker) {
            const ticker = response.data.ticker;
            
            // Get pre-market specific data
            const preMarket = ticker.preMarket || {};
            const day = ticker.day || {};
            const prevDay = ticker.prevDay || {};
            
            // Use pre-market data if available, otherwise use regular day data
            const currentPrice = preMarket.c || day.c || prevDay.c || 0;
            const openPrice = preMarket.o || day.o || prevDay.c || 0;
            const highPrice = preMarket.h || day.h || currentPrice;
            const lowPrice = preMarket.l || day.l || currentPrice;
            const volume = preMarket.v || day.v || 0;
            const vwap = preMarket.vw || day.vw || currentPrice;
            
            const data = {
                symbol: symbol,
                price: currentPrice,
                open: openPrice,
                high: highPrice,
                low: lowPrice,
                volume: volume,
                vwap: vwap,
                prevClose: prevDay.c || 0,
                prevVolume: prevDay.v || 0,
                avgVolume: prevDay.v || volume, // Use previous day as average
                timestamp: new Date(),
                updated: ticker.updated || Date.now()
            };
            
            // Calculate technicals
            const technicals = calculateTechnicals(data);
            
            return {
                ...data,
                ...technicals
            };
        }
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error.message);
    }
    return null;
}

// Fetch top pre-market movers
async function fetchTopPremarketStocks() {
    try {
        console.log('🌅 Fetching pre-market movers...');
        
        // Get all tickers snapshot
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=500`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            const premarketStocks = [];
            
            for (const ticker of response.data.tickers) {
                // Filter for stocks with pre-market activity
                const preMarket = ticker.preMarket || {};
                const day = ticker.day || {};
                const prevDay = ticker.prevDay || {};
                
                // Use pre-market volume if available, otherwise day volume
                const volume = preMarket.v || day.v || 0;
                const price = preMarket.c || day.c || prevDay.c || 0;
                
                // Filter criteria for pre-market stocks
                if (volume > 100000 && price > 1 && price < 500) {
                    const data = {
                        symbol: ticker.ticker,
                        price: price,
                        open: preMarket.o || day.o || prevDay.c || 0,
                        high: preMarket.h || day.h || price,
                        low: preMarket.l || day.l || price,
                        volume: volume,
                        vwap: preMarket.vw || day.vw || price,
                        prevClose: prevDay.c || 0,
                        prevVolume: prevDay.v || 0,
                        avgVolume: prevDay.v || volume,
                        timestamp: new Date()
                    };
                    
                    // Calculate technicals
                    const technicals = calculateTechnicals(data);
                    const stockData = { ...data, ...technicals };
                    
                    // Calculate strategy score
                    const strategyAnalysis = calculateStrategyScore(stockData);
                    stockData.strategyScore = strategyAnalysis.score;
                    stockData.strategyGrade = strategyAnalysis.grade;
                    stockData.strategyReasons = strategyAnalysis.reasons;
                    
                    premarketStocks.push(stockData);
                }
            }
            
            // Sort by strategy score, then by volume
            premarketStocks.sort((a, b) => {
                if (b.strategyScore !== a.strategyScore) {
                    return b.strategyScore - a.strategyScore;
                }
                return b.volume - a.volume;
            });
            
            // Return top 50
            return premarketStocks.slice(0, 50);
        }
    } catch (error) {
        console.error('Error fetching pre-market stocks:', error.message);
    }
    
    return [];
}

// API endpoint for pre-market scanner
app.get('/api/premarket/scanner', async (req, res) => {
    try {
        // Check if we need to refresh (every 30 seconds)
        const now = Date.now();
        const needsRefresh = !lastUpdateTime || (now - lastUpdateTime) > 30000;
        
        if (needsRefresh) {
            console.log('Refreshing pre-market data...');
            topPremarketStocks = await fetchTopPremarketStocks();
            lastUpdateTime = now;
        }
        
        res.json({
            success: true,
            isPremarket: isPremarketHours(),
            lastUpdate: lastUpdateTime,
            count: topPremarketStocks.length,
            stocks: topPremarketStocks
        });
    } catch (error) {
        console.error('Scanner error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API endpoint for single stock pre-market data
app.get('/api/premarket/stock/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const data = await fetchPremarketData(symbol.toUpperCase());
        
        if (data) {
            const strategyAnalysis = calculateStrategyScore(data);
            data.strategyScore = strategyAnalysis.score;
            data.strategyGrade = strategyAnalysis.grade;
            data.strategyReasons = strategyAnalysis.reasons;
        }
        
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Stock fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        isPremarket: isPremarketHours(),
        lastUpdate: lastUpdateTime,
        stocksInCache: topPremarketStocks.length
    });
});

// Auto-refresh pre-market data during pre-market hours
setInterval(async () => {
    if (isPremarketHours()) {
        console.log('⏰ Auto-refreshing pre-market data...');
        topPremarketStocks = await fetchTopPremarketStocks();
        lastUpdateTime = Date.now();
    }
}, 60000); // Every minute during pre-market

const PORT = process.env.PORT || 3007;
app.listen(PORT, () => {
    console.log(`🌅 Pre-Market Scanner Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔌 API: http://localhost:${PORT}/api/premarket/scanner`);
    
    // Initial fetch
    fetchTopPremarketStocks().then(stocks => {
        topPremarketStocks = stocks;
        lastUpdateTime = Date.now();
        console.log(`✅ Loaded ${stocks.length} pre-market stocks`);
    });
});