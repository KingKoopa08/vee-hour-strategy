const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the premarket scanner dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'premarket-dashboard.html'));
});

// Also serve at /top20 route
app.get('/top20', (req, res) => {
    res.sendFile(path.join(__dirname, 'premarket-dashboard.html'));
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

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return 50; // Default neutral RSI
    
    let gains = 0;
    let losses = 0;
    
    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) {
            gains += change;
        } else {
            losses -= change;
        }
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // Calculate subsequent values using Wilder's smoothing
    for (let i = period + 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) {
            avgGain = (avgGain * (period - 1) + change) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) - change) / period;
        }
    }
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.round(rsi);
}

// Calculate mNAV Score (Market-Normalized Asset Value)
// Enhanced scoring to identify exceptional pre-market opportunities
function calculatemNAVScore(stock) {
    let score = 0;
    
    // Volume component (0.35 weight) - increased weight for liquidity
    // More aggressive scaling for high volume stocks
    const volumeScore = Math.min(stock.volumeRatio / 2, 1) * 0.35; // Changed from /5 to /2
    
    // Momentum component (0.30 weight) - increased weight
    // Rewards stronger price movements
    const momentumAbs = Math.abs(stock.priceChangePercent || 0);
    const momentumScore = Math.min(momentumAbs / 10, 1) * 0.30; // Changed from /20 to /10
    
    // Volatility component (0.15 weight) - reduced weight
    // Prefer 2-5% range for pre-market
    const volatility = stock.rangePercent || 0;
    let volatilityScore = 0;
    if (volatility >= 2 && volatility <= 5) {
        volatilityScore = 1 * 0.15; // Perfect range
    } else if (volatility > 5 && volatility <= 10) {
        volatilityScore = 0.8 * 0.15; // Good range
    } else if (volatility > 10) {
        volatilityScore = 0.6 * 0.15; // High but tradeable
    } else {
        volatilityScore = (volatility / 2) * 0.15; // Low volatility
    }
    
    // Liquidity component (0.10 weight)
    // Exponential scaling for very liquid stocks
    const liquidityScore = Math.min(Math.pow(stock.volume / 5000000, 0.7), 1) * 0.10;
    
    // Price efficiency (0.10 weight) - proximity to VWAP
    const vwapDiff = Math.abs(((stock.price - stock.vwap) / stock.vwap) * 100);
    const efficiencyScore = Math.max(0, 1 - (vwapDiff / 20)) * 0.10; // More forgiving
    
    score = volumeScore + momentumScore + volatilityScore + liquidityScore + efficiencyScore;
    
    // Enhanced RSI adjustment
    if (stock.rsi) {
        if (stock.rsi > 70 || stock.rsi < 30) {
            score *= 1.2; // 20% boost for extreme RSI
        } else if (stock.rsi > 60 || stock.rsi < 40) {
            score *= 1.1; // 10% boost for trending
        } else if (stock.rsi >= 48 && stock.rsi <= 52) {
            score *= 0.95; // Small penalty for very neutral
        }
    }
    
    // Bonus for exceptional conditions
    if (stock.volumeRatio > 5 && Math.abs(stock.priceChangePercent) > 5) {
        score *= 1.15; // 15% bonus for high volume + high movement
    }
    
    return Math.min(1, score); // Cap at 1.0
}

// Calculate tax implications
function calculateTaxImplications(priceChange, volume, price) {
    // Estimate based on typical retail vs institutional trading patterns
    const estimatedDollarVolume = volume * price;
    const isHighVolume = volume > 5000000;
    
    // Short-term capital gains apply to day trading
    const shortTermRate = 0.37; // Assume highest bracket for safety
    const estimatedGain = Math.abs(priceChange) * (volume * 0.001); // Assume 0.1% participation
    const estimatedTax = estimatedGain * shortTermRate;
    
    return {
        type: 'SHORT_TERM',
        rate: shortTermRate,
        estimatedTaxPerShare: (Math.abs(priceChange) * shortTermRate).toFixed(3),
        washSaleRisk: isHighVolume ? 'HIGH' : 'MODERATE',
        note: priceChange > 0 ? 'Gains taxable at ordinary income rates' : 'Losses may offset gains'
    };
}

// Fetch historical data for RSI calculation
async function fetchHistoricalPrices(symbol, days = 20) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.results) {
            return response.data.results.map(r => r.c); // Return closing prices
        }
    } catch (error) {
        console.error(`Error fetching historical for ${symbol}:`, error.message);
    }
    return [];
}

// Fetch recent news for a stock (last 48 hours)
async function fetchRecentNews(symbol) {
    try {
        // Calculate date 48 hours ago
        const twoDaysAgo = new Date();
        twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);
        const fromDate = twoDaysAgo.toISOString().split('T')[0];
        
        const url = `${POLYGON_BASE_URL}/v2/reference/news?ticker=${symbol}&published_utc.gte=${fromDate}&limit=5&apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.results && response.data.results.length > 0) {
            // Get the most recent news items
            const news = response.data.results.map(article => ({
                title: article.title,
                publisher: article.publisher.name,
                publishedAt: new Date(article.published_utc),
                url: article.article_url,
                sentiment: article.sentiment || 'neutral'
            }));
            
            // Return summary of news with URLs for clickable links
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

// Fetch pre-market data for a single stock with enhanced metrics
async function fetchEnhancedPremarketData(symbol) {
    try {
        // Get snapshot data
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.ticker) {
            const ticker = response.data.ticker;
            
            // Get pre-market specific data
            const preMarket = ticker.preMarket || {};
            const day = ticker.day || {};
            const prevDay = ticker.prevDay || {};
            
            // PRIORITIZE pre-market data during pre-market hours
            let currentPrice, openPrice, highPrice, lowPrice, volume, vwap;
            
            if (isPremarketHours() && preMarket.v && preMarket.v > 0) {
                // Use ONLY pre-market data during pre-market hours
                currentPrice = preMarket.c || preMarket.l || prevDay.c || 0;
                openPrice = preMarket.o || prevDay.c || 0;
                highPrice = preMarket.h || currentPrice;
                lowPrice = preMarket.l || currentPrice;
                volume = preMarket.v;
                vwap = preMarket.vw || currentPrice;
                console.log(`  └─ Using PRE-MARKET data for ${symbol}: Vol ${(volume/1000000).toFixed(2)}M`);
            } else {
                // Use day data when not in pre-market or no pre-market data
                currentPrice = day.c || preMarket.c || prevDay.c || 0;
                openPrice = day.o || preMarket.o || prevDay.c || 0;
                highPrice = day.h || preMarket.h || currentPrice;
                lowPrice = day.l || preMarket.l || currentPrice;
                volume = day.v || preMarket.v || 0;
                vwap = day.vw || preMarket.vw || currentPrice;
            }
            
            // Calculate basic metrics
            const priceChange = currentPrice - (prevDay.c || currentPrice);
            const priceChangePercent = ((priceChange / (prevDay.c || 1)) * 100);
            const volumeRatio = (prevDay.v && prevDay.v > 0) ? volume / prevDay.v : 1;
            const rangePercent = ((highPrice - lowPrice) / currentPrice) * 100;
            
            // Fetch recent news instead of RSI
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
                rsi: 50, // Default RSI for mNAV calculation
                news: newsData,
                timestamp: new Date()
            };
            
            // Calculate mNAV score
            stockData.mnavScore = calculatemNAVScore(stockData);
            
            // Calculate tax implications
            stockData.taxImplications = calculateTaxImplications(priceChange, volume, currentPrice);
            
            return stockData;
        }
    } catch (error) {
        console.error(`Error fetching ${symbol}:`, error.message);
    }
    return null;
}

// Fetch top 20 pre-market stocks by VOLUME (liquidity is key for day trading)
async function fetchTop20PremarketStocks() {
    try {
        const timeLabel = isPremarketHours() ? 'PRE-MARKET' : 'REGULAR HOURS';
        console.log(`🌅 Fetching top 20 highest volume stocks (${timeLabel})...`);
        
        // Get tickers sorted by volume - this is what matters for day trading
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=100`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            const topVolumeStocks = [];
            let processed = 0;
            
            // Debug first few tickers to see structure
            if (response.data.tickers.length > 0 && isPremarketHours()) {
                console.log(`📋 Debug first 3 tickers during PRE-MARKET:`);
                for (let i = 0; i < Math.min(3, response.data.tickers.length); i++) {
                    const t = response.data.tickers[i];
                    console.log(`   ${t.ticker}:`);
                    console.log(`     preMarket exists: ${!!t.preMarket}, has volume: ${t.preMarket?.v > 0}`);
                    console.log(`     day.v: ${t.day?.v || 0}, day.c: ${t.day?.c || 0}`);
                    console.log(`     prevDay.v: ${t.prevDay?.v || 0}`);
                }
            }
            
            // Process top volume stocks - PRIORITIZE PRE-MARKET DATA
            for (const ticker of response.data.tickers) {
                if (topVolumeStocks.length >= 20) break;
                
                const preMarket = ticker.preMarket || {};
                const day = ticker.day || {};
                const prevDay = ticker.prevDay || {};
                
                // IMPORTANT: During pre-market hours, Polygon puts pre-market data in the 'day' field
                // The 'preMarket' field is typically only populated AFTER pre-market closes
                let volume = 0;
                let price = 0;
                let dataSource = 'UNKNOWN';
                
                if (isPremarketHours()) {
                    // During pre-market hours, the 'day' field contains pre-market data
                    // Skip stocks with no volume during pre-market
                    if (!day.v || day.v === 0) {
                        continue;
                    }
                    volume = day.v;
                    price = day.c || day.l || prevDay.c || 0;
                    dataSource = 'PRE-MARKET';
                } else {
                    // Outside pre-market hours, use regular market data
                    volume = day.v || preMarket.v || 0;
                    price = day.c || preMarket.c || prevDay.c || 0;
                    dataSource = 'REGULAR';
                }
                
                // Basic filters for tradeable stocks
                // Min volume 100K for liquidity, price between $1-100 for accessibility
                if (volume > 100000 && price >= 1 && price <= 100) {
                    processed++;
                    const dataSource = usingPremarket ? 'PRE-MARKET' : 'REGULAR';
                    console.log(`Processing ${ticker.ticker}: ${dataSource} Volume ${(volume/1000000).toFixed(2)}M`);
                    
                    // Fetch enhanced data including news
                    const enhancedData = await fetchEnhancedPremarketData(ticker.ticker);
                    
                    if (enhancedData) {
                        topVolumeStocks.push(enhancedData);
                        console.log(`✓ ${ticker.ticker}: Volume ${(volume/1000000).toFixed(2)}M, mNAV ${enhancedData.mnavScore.toFixed(2)}`);
                    }
                }
            }
            
            // Sort by volume ONLY - highest volume first for best liquidity
            topVolumeStocks.sort((a, b) => b.volume - a.volume);
            
            const result = topVolumeStocks.slice(0, 20);
            const avgVolume = result.reduce((sum, s) => sum + s.volume, 0) / result.length;
            const avgMnav = result.reduce((sum, s) => sum + s.mnavScore, 0) / result.length;
            
            console.log(`📊 Returning ${result.length} stocks:`);
            console.log(`   Average Volume: ${(avgVolume/1000000).toFixed(2)}M shares`);
            console.log(`   Average mNAV: ${avgMnav.toFixed(2)} (informational only)`);
            console.log(`   Top stock: ${result[0]?.symbol} with ${(result[0]?.volume/1000000).toFixed(2)}M volume`);
            
            return result;
        }
    } catch (error) {
        console.error('Error fetching pre-market stocks:', error.message);
    }
    
    return [];
}

// API endpoint for top 20 pre-market stocks
app.get('/api/premarket/top20', async (req, res) => {
    try {
        // Check if we need to refresh (every 60 seconds during pre-market)
        const now = Date.now();
        const needsRefresh = !lastUpdateTime || (now - lastUpdateTime) > 60000;
        
        if (needsRefresh || topPremarketStocks.length === 0) {
            console.log('Refreshing top 20 pre-market data...');
            topPremarketStocks = await fetchTop20PremarketStocks();
            lastUpdateTime = now;
        }
        
        res.json({
            success: true,
            isPremarket: isPremarketHours(),
            lastUpdate: lastUpdateTime,
            updateTime: new Date(lastUpdateTime).toLocaleTimeString('en-US', {
                timeZone: 'America/New_York',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }) + ' ET',
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

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        isPremarket: isPremarketHours(),
        lastUpdate: lastUpdateTime,
        stocksInCache: topPremarketStocks.length
    });
});

// Auto-refresh at 4:00 AM ET every morning
function scheduleMarketRefresh() {
    const checkTime = () => {
        const now = new Date();
        const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
        const hours = easternTime.getHours();
        const minutes = easternTime.getMinutes();
        
        // Refresh at 4:00 AM ET (start of pre-market)
        if (hours === 4 && minutes === 0) {
            console.log('📅 4:00 AM ET - Starting morning pre-market scan...');
            fetchTop20PremarketStocks().then(stocks => {
                topPremarketStocks = stocks;
                lastUpdateTime = Date.now();
                console.log(`✅ Morning scan complete: ${stocks.length} stocks loaded`);
            });
        }
        
        // Also refresh every 5 minutes during pre-market hours
        if (isPremarketHours() && minutes % 5 === 0) {
            console.log('⏰ Pre-market auto-refresh...');
            fetchTop20PremarketStocks().then(stocks => {
                topPremarketStocks = stocks;
                lastUpdateTime = Date.now();
            });
        }
    };
    
    // Check every minute
    setInterval(checkTime, 60000);
    checkTime(); // Initial check
}

const PORT = process.env.PORT || 3011;
app.listen(PORT, () => {
    console.log(`🌅 Pre-Market Scanner V2 running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔌 API: http://localhost:${PORT}/api/premarket/top20`);
    console.log(`⏰ Auto-refresh scheduled for 4:00 AM ET daily`);
    
    // Initial fetch
    fetchTop20PremarketStocks().then(stocks => {
        topPremarketStocks = stocks;
        lastUpdateTime = Date.now();
        console.log(`✅ Loaded ${stocks.length} pre-market stocks`);
    });
    
    // Schedule daily refresh
    scheduleMarketRefresh();
});