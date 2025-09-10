const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (for CSS/JS if needed)
app.use(express.static(path.join(__dirname)));

// ==================== ROUTES ====================

// Landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Pre-market scanner page
app.get('/premarket', (req, res) => {
    res.sendFile(path.join(__dirname, 'premarket-dashboard.html'));
});

// Market hours scanner page  
app.get('/market', (req, res) => {
    res.sendFile(path.join(__dirname, 'market-dashboard.html'));
});

// ==================== CONFIGURATION ====================

// Polygon.io configuration
const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Cache for scanner data
let premarketCache = new Map();
let marketCache = new Map();
let lastPremarketUpdate = null;
let lastMarketUpdate = null;
let topPremarketStocks = [];
let topMarketStocks = [];

// ==================== HELPER FUNCTIONS ====================

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

// Helper to check if market is in regular trading hours (9:30 AM - 4:00 PM ET)
function isMarketHours() {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const hours = easternTime.getHours();
    const minutes = easternTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const dayOfWeek = easternTime.getDay();
    
    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    
    // Market hours: 9:30 AM (570) to 4:00 PM (960) ET
    return totalMinutes >= 570 && totalMinutes < 960;
}

// Calculate mNAV Score (Market-Normalized Asset Value)
function calculatemNAVScore(stock) {
    let score = 0;
    
    // Volume component (0.35 weight)
    const volumeScore = Math.min(stock.volumeRatio / 2, 1) * 0.35;
    
    // Momentum component (0.30 weight)
    const momentumAbs = Math.abs(stock.priceChangePercent || 0);
    const momentumScore = Math.min(momentumAbs / 10, 1) * 0.30;
    
    // Volatility component (0.15 weight)
    const volatility = stock.rangePercent || 0;
    let volatilityScore = 0;
    if (volatility >= 2 && volatility <= 5) {
        volatilityScore = 1 * 0.15;
    } else if (volatility > 5 && volatility <= 10) {
        volatilityScore = 0.8 * 0.15;
    } else if (volatility > 10) {
        volatilityScore = 0.6 * 0.15;
    } else {
        volatilityScore = (volatility / 2) * 0.15;
    }
    
    // Liquidity component (0.10 weight)
    const liquidityScore = Math.min(Math.pow(stock.volume / 5000000, 0.7), 1) * 0.10;
    
    // Price efficiency (0.10 weight)
    const vwapDiff = Math.abs(((stock.price - stock.vwap) / stock.vwap) * 100);
    const efficiencyScore = Math.max(0, 1 - (vwapDiff / 20)) * 0.10;
    
    score = volumeScore + momentumScore + volatilityScore + liquidityScore + efficiencyScore;
    
    return Math.min(1, score);
}

// Calculate tax implications
function calculateTaxImplications(priceChange, volume, price) {
    const estimatedDollarVolume = volume * price;
    const isHighVolume = volume > 5000000;
    
    const shortTermRate = 0.37;
    const estimatedGain = Math.abs(priceChange) * (volume * 0.001);
    const estimatedTax = estimatedGain * shortTermRate;
    
    return {
        type: 'SHORT_TERM',
        rate: shortTermRate,
        estimatedTaxPerShare: (Math.abs(priceChange) * shortTermRate).toFixed(3),
        washSaleRisk: isHighVolume ? 'HIGH' : 'MODERATE',
        note: priceChange > 0 ? 'Gains taxable at ordinary income rates' : 'Losses may offset gains'
    };
}

// Fetch recent news for a stock (last 48 hours)
async function fetchRecentNews(symbol) {
    try {
        const twoDaysAgo = new Date();
        twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);
        const fromDate = twoDaysAgo.toISOString().split('T')[0];
        
        const url = `${POLYGON_BASE_URL}/v2/reference/news?ticker=${symbol}&published_utc.gte=${fromDate}&limit=5&apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.results && response.data.results.length > 0) {
            const news = response.data.results.map(article => ({
                title: article.title,
                publisher: article.publisher.name,
                publishedAt: new Date(article.published_utc),
                url: article.article_url,
                sentiment: article.sentiment || 'neutral'
            }));
            
            return {
                count: news.length,
                latestTitle: news[0].title,
                latestPublisher: news[0].publisher,
                latestUrl: news[0].url,
                hoursAgo: Math.round((Date.now() - news[0].publishedAt) / (1000 * 60 * 60)),
                headlines: news.slice(0, 3).map(n => ({
                    title: n.title,
                    url: n.url,
                    publisher: n.publisher,
                    hoursAgo: Math.round((Date.now() - n.publishedAt) / (1000 * 60 * 60))
                }))
            };
        }
    } catch (error) {
        console.error(`Error fetching news for ${symbol}:`, error.message);
    }
    
    return {
        count: 0,
        latestTitle: 'No recent news',
        latestPublisher: '',
        hoursAgo: null,
        headlines: []
    };
}

// Fetch stock data with enhanced metrics
async function fetchEnhancedStockData(symbol, usePremarket = false) {
    try {
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.ticker) {
            const ticker = response.data.ticker;
            const day = ticker.day || {};
            const prevDay = ticker.prevDay || {};
            const min = ticker.min || {};
            
            let currentPrice, openPrice, highPrice, lowPrice, volume, vwap;
            
            if (usePremarket && isPremarketHours() && min.av && min.av > 0) {
                // Pre-market hours: use min field
                currentPrice = min.c || min.l || prevDay.c || 0;
                openPrice = min.o || prevDay.c || 0;
                highPrice = min.h || currentPrice;
                lowPrice = min.l || currentPrice;
                volume = min.av || 0;
                vwap = min.vw || currentPrice;
            } else if (day.v && day.v > 0) {
                // Regular market hours: use day field
                currentPrice = day.c || prevDay.c || 0;
                openPrice = day.o || prevDay.c || 0;
                highPrice = day.h || currentPrice;
                lowPrice = day.l || currentPrice;
                volume = day.v || 0;
                vwap = day.vw || currentPrice;
            } else {
                // Fallback to previous day
                currentPrice = prevDay.c || 0;
                openPrice = prevDay.c || 0;
                highPrice = prevDay.h || currentPrice;
                lowPrice = prevDay.l || currentPrice;
                volume = 0;
                vwap = currentPrice;
            }
            
            // Calculate metrics
            const priceChange = currentPrice - (prevDay.c || currentPrice);
            const priceChangePercent = ((priceChange / (prevDay.c || 1)) * 100);
            const volumeRatio = (prevDay.v && prevDay.v > 0) ? volume / prevDay.v : 1;
            const rangePercent = ((highPrice - lowPrice) / currentPrice) * 100;
            
            // Buy/sell indicators
            const priceVsVwap = vwap > 0 ? ((currentPrice - vwap) / vwap) * 100 : 0;
            const isAboveVwap = currentPrice > vwap;
            const positionInRange = highPrice > lowPrice ? 
                ((currentPrice - lowPrice) / (highPrice - lowPrice)) * 100 : 50;
            
            // Momentum indicator
            let momentum = 'NEUTRAL';
            let momentumScore = 0;
            if (priceChangePercent > 2) {
                momentum = 'STRONG_UP';
                momentumScore = 2;
            } else if (priceChangePercent > 0.5) {
                momentum = 'UP';
                momentumScore = 1;
            } else if (priceChangePercent < -2) {
                momentum = 'STRONG_DOWN';
                momentumScore = -2;
            } else if (priceChangePercent < -0.5) {
                momentum = 'DOWN';
                momentumScore = -1;
            }
            
            // Volume surge indicator
            let volumeSurge = 'NORMAL';
            if (volumeRatio > 3) {
                volumeSurge = 'EXTREME';
            } else if (volumeRatio > 2) {
                volumeSurge = 'HIGH';
            } else if (volumeRatio > 1.5) {
                volumeSurge = 'ELEVATED';
            }
            
            // Calculate signal
            let signalScore = 0;
            signalScore += momentumScore * 2;
            signalScore += isAboveVwap ? 1 : -1;
            signalScore += positionInRange > 70 ? 1 : positionInRange < 30 ? -1 : 0;
            signalScore += volumeSurge === 'EXTREME' ? 2 : volumeSurge === 'HIGH' ? 1 : 0;
            
            let signal = 'HOLD';
            if (signalScore >= 4) signal = 'STRONG_BUY';
            else if (signalScore >= 2) signal = 'BUY';
            else if (signalScore <= -4) signal = 'STRONG_SELL';
            else if (signalScore <= -2) signal = 'SELL';
            
            // Fetch news
            const newsData = await fetchRecentNews(symbol);
            
            const stockData = {
                symbol: symbol,
                price: currentPrice,
                open: openPrice,
                high: highPrice,
                low: lowPrice,
                volume: volume,
                vwap: vwap,
                prevClose: prevDay.c || 0,
                priceChange: priceChange,
                priceChangePercent: priceChangePercent,
                volumeRatio: volumeRatio,
                rangePercent: rangePercent,
                priceVsVwap: priceVsVwap,
                isAboveVwap: isAboveVwap,
                positionInRange: positionInRange,
                momentum: momentum,
                momentumScore: momentumScore,
                volumeSurge: volumeSurge,
                signal: signal,
                signalScore: signalScore,
                rsi: 50,
                news: newsData,
                timestamp: new Date()
            };
            
            stockData.mnavScore = calculatemNAVScore(stockData);
            stockData.taxImplications = calculateTaxImplications(priceChange, volume, currentPrice);
            
            return stockData;
        }
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error.message);
    }
    return null;
}

// Fetch top 20 stocks for pre-market or market hours
async function fetchTop20Stocks(isPremarket = false) {
    try {
        const timeLabel = isPremarket ? 'PRE-MARKET' : 'MARKET HOURS';
        console.log(`📊 Fetching top 20 highest volume stocks (${timeLabel})...`);
        
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&limit=1000`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            const allStocks = [];
            
            for (const ticker of response.data.tickers) {
                const day = ticker.day || {};
                const prevDay = ticker.prevDay || {};
                const min = ticker.min || {};
                
                let volume = 0;
                let price = 0;
                
                if (isPremarket && isPremarketHours()) {
                    volume = min.av || 0;
                    if (volume === 0) continue;
                    price = min.c || min.l || prevDay.c || 0;
                } else {
                    volume = day.v || 0;
                    if (volume === 0) continue;
                    price = day.c || prevDay.c || 0;
                }
                
                // Filter: volume > 100K, price $1-100
                if (volume > 100000 && price >= 1 && price <= 100) {
                    allStocks.push({
                        ticker: ticker.ticker,
                        volume: volume,
                        price: price
                    });
                }
            }
            
            // Sort by volume
            allStocks.sort((a, b) => b.volume - a.volume);
            
            console.log(`📊 Found ${allStocks.length} stocks with activity`);
            
            // Process top 20
            const topStocks = [];
            for (const stock of allStocks.slice(0, 20)) {
                const enhancedData = await fetchEnhancedStockData(stock.ticker, isPremarket);
                if (enhancedData) {
                    topStocks.push(enhancedData);
                    console.log(`✓ ${stock.ticker}: Volume ${(stock.volume/1000000).toFixed(2)}M`);
                }
            }
            
            return topStocks;
        }
    } catch (error) {
        console.error('Error fetching stocks:', error.message);
    }
    
    return [];
}

// ==================== API ENDPOINTS ====================

// Pre-market API endpoint
app.get('/api/premarket/top20', async (req, res) => {
    try {
        const now = Date.now();
        const needsRefresh = !lastPremarketUpdate || (now - lastPremarketUpdate) > 10000;
        
        if (needsRefresh || topPremarketStocks.length === 0) {
            console.log('Refreshing pre-market data...');
            topPremarketStocks = await fetchTop20Stocks(true);
            lastPremarketUpdate = now;
        }
        
        res.json({
            success: true,
            isPremarket: isPremarketHours(),
            lastUpdate: lastPremarketUpdate,
            updateTime: new Date(lastPremarketUpdate).toLocaleTimeString('en-US', {
                timeZone: 'America/New_York',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }) + ' ET',
            count: topPremarketStocks.length,
            stocks: topPremarketStocks
        });
    } catch (error) {
        console.error('Pre-market scanner error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Market hours API endpoint
app.get('/api/market/top20', async (req, res) => {
    try {
        const now = Date.now();
        const needsRefresh = !lastMarketUpdate || (now - lastMarketUpdate) > 10000;
        
        if (needsRefresh || topMarketStocks.length === 0) {
            console.log('Refreshing market data...');
            topMarketStocks = await fetchTop20Stocks(false);
            lastMarketUpdate = now;
        }
        
        res.json({
            success: true,
            isMarketOpen: isMarketHours(),
            lastUpdate: lastMarketUpdate,
            updateTime: new Date(lastMarketUpdate).toLocaleTimeString('en-US', {
                timeZone: 'America/New_York',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }) + ' ET',
            count: topMarketStocks.length,
            stocks: topMarketStocks
        });
    } catch (error) {
        console.error('Market scanner error:', error);
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
        isMarketOpen: isMarketHours(),
        lastPremarketUpdate: lastPremarketUpdate,
        lastMarketUpdate: lastMarketUpdate,
        premarketStocksInCache: topPremarketStocks.length,
        marketStocksInCache: topMarketStocks.length
    });
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3011;
app.listen(PORT, () => {
    console.log(`🚀 Trading Scanner Server running on port ${PORT}`);
    console.log(`📊 Landing Page: http://localhost:${PORT}`);
    console.log(`🌅 Pre-Market Scanner: http://localhost:${PORT}/premarket`);
    console.log(`📈 Market Hours Scanner: http://localhost:${PORT}/market`);
    console.log(`⏰ Auto-refresh enabled for live data`);
    
    // Initial fetch for both scanners
    if (isPremarketHours()) {
        fetchTop20Stocks(true).then(stocks => {
            topPremarketStocks = stocks;
            lastPremarketUpdate = Date.now();
            console.log(`✅ Loaded ${stocks.length} pre-market stocks`);
        });
    }
    
    if (isMarketHours()) {
        fetchTop20Stocks(false).then(stocks => {
            topMarketStocks = stocks;
            lastMarketUpdate = Date.now();
            console.log(`✅ Loaded ${stocks.length} market stocks`);
        });
    }
});