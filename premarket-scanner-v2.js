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
            
            // Use pre-market data if available, otherwise use regular day data
            const currentPrice = preMarket.c || day.c || prevDay.c || 0;
            const openPrice = preMarket.o || day.o || prevDay.c || 0;
            const highPrice = preMarket.h || day.h || currentPrice;
            const lowPrice = preMarket.l || day.l || currentPrice;
            const volume = preMarket.v || day.v || 0;
            const vwap = preMarket.vw || day.vw || currentPrice;
            
            // Calculate basic metrics
            const priceChange = currentPrice - (prevDay.c || currentPrice);
            const priceChangePercent = ((priceChange / (prevDay.c || 1)) * 100);
            const volumeRatio = (prevDay.v && prevDay.v > 0) ? volume / prevDay.v : 1;
            const rangePercent = ((highPrice - lowPrice) / currentPrice) * 100;
            
            // Fetch historical prices for RSI
            const historicalPrices = await fetchHistoricalPrices(symbol);
            historicalPrices.push(currentPrice); // Add current price
            const rsi = calculateRSI(historicalPrices);
            
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
                rsi: rsi,
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

// Fetch top 20 pre-market movers with mNAV > 0.88
async function fetchTop20PremarketStocks() {
    try {
        console.log('🌅 Fetching top 20 pre-market stocks with mNAV > 0.88...');
        
        // Get more tickers to ensure we find 20 with high mNAV
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=500`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            const highMnavStocks = [];
            let processed = 0;
            const maxToProcess = Math.min(response.data.tickers.length, 200); // Process up to 200 stocks
            
            // Process tickers to find high mNAV stocks
            for (const ticker of response.data.tickers) {
                if (processed >= maxToProcess) break;
                
                const preMarket = ticker.preMarket || {};
                const day = ticker.day || {};
                const prevDay = ticker.prevDay || {};
                
                const volume = preMarket.v || day.v || 0;
                const price = preMarket.c || day.c || prevDay.c || 0;
                
                // Basic filter criteria
                if (volume > 50000 && price > 0.5 && price < 10000) {
                    processed++;
                    
                    // Fetch enhanced data for this stock
                    const enhancedData = await fetchEnhancedPremarketData(ticker.ticker);
                    
                    // Only include if mNAV score is above 0.88
                    if (enhancedData && enhancedData.mnavScore > 0.88) {
                        highMnavStocks.push(enhancedData);
                        console.log(`✓ ${ticker.ticker}: mNAV ${enhancedData.mnavScore.toFixed(2)}`);
                        
                        // Stop once we have 20 high mNAV stocks
                        if (highMnavStocks.length >= 20) break;
                    }
                }
            }
            
            // If we don't have 20 stocks with mNAV > 0.88, lower threshold slightly
            if (highMnavStocks.length < 20) {
                console.log(`⚠️ Only found ${highMnavStocks.length} stocks with mNAV > 0.88, searching for more...`);
                
                // Process more stocks with slightly lower threshold
                for (const ticker of response.data.tickers.slice(processed)) {
                    if (highMnavStocks.length >= 20) break;
                    
                    const preMarket = ticker.preMarket || {};
                    const day = ticker.day || {};
                    const prevDay = ticker.prevDay || {};
                    
                    const volume = preMarket.v || day.v || 0;
                    const price = preMarket.c || day.c || prevDay.c || 0;
                    
                    if (volume > 25000 && price > 0.5 && price < 10000) {
                        const enhancedData = await fetchEnhancedPremarketData(ticker.ticker);
                        
                        // Use slightly lower threshold if needed (0.85)
                        if (enhancedData && enhancedData.mnavScore > 0.85) {
                            highMnavStocks.push(enhancedData);
                            console.log(`✓ ${ticker.ticker}: mNAV ${enhancedData.mnavScore.toFixed(2)} (backup)`);
                        }
                    }
                }
            }
            
            // Sort by mNAV score (highest first), then by volume
            highMnavStocks.sort((a, b) => {
                if (Math.abs(b.mnavScore - a.mnavScore) > 0.01) {
                    return b.mnavScore - a.mnavScore;
                }
                return b.volume - a.volume;
            });
            
            const result = highMnavStocks.slice(0, 20);
            console.log(`📊 Returning ${result.length} stocks with average mNAV: ${(result.reduce((sum, s) => sum + s.mnavScore, 0) / result.length).toFixed(2)}`);
            
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