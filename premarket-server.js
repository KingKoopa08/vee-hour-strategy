const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Serve the index.html file as landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
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

// Pre-market watchlist - stocks that often have high pre-market volume
const PREMARKET_WATCHLIST = ['SLXN', 'YYGH', 'OPEN', 'VNCE', 'TGL', 'SPY', 'QQQ', 'TSLA', 'NVDA', 'AMD', 'AAPL', 'META', 'AMZN', 'GOOGL', 'MSFT'];

// Cache for pre-market data
let premarketDataCache = new Map();
let premarketCacheTime = null;

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

// Fetch true pre-market data using aggregates API
async function fetchPreMarketDataForSymbol(symbol) {
    try {
        const today = getTodayDate();
        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/1/minute/${today}/${today}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        
        const response = await axios.get(url);
        
        if (response.data && response.data.results) {
            const bars = response.data.results;
            
            // Filter for pre-market hours (4:00 AM to 9:30 AM ET)
            const premarketBars = bars.filter(bar => {
                const date = new Date(bar.t);
                const hour = date.getUTCHours() - 5; // Convert to ET
                const minute = date.getMinutes();
                const totalMinutes = hour * 60 + minute;
                
                // Pre-market: 4:00 AM (240 minutes) to 9:30 AM (570 minutes)
                return totalMinutes >= 240 && totalMinutes < 570;
            });
            
            if (premarketBars.length > 0) {
                // Calculate pre-market metrics
                const premarketVolume = premarketBars.reduce((sum, bar) => sum + (bar.v || 0), 0);
                const firstBar = premarketBars[0];
                const lastBar = premarketBars[premarketBars.length - 1];
                const premarketHigh = Math.max(...premarketBars.map(bar => bar.h || 0));
                const premarketLow = Math.min(...premarketBars.filter(bar => bar.l > 0).map(bar => bar.l));
                
                // Calculate VWAP using typical price formula
                let totalValue = 0;
                let totalVolume = 0;
                premarketBars.forEach(bar => {
                    if (bar.v > 0) {
                        // Typical price = (High + Low + Close) / 3
                        const typicalPrice = (bar.h + bar.l + bar.c) / 3;
                        totalValue += typicalPrice * bar.v;
                        totalVolume += bar.v;
                    }
                });
                const premarketVWAP = totalVolume > 0 ? totalValue / totalVolume : 0;
                
                // Calculate trend (comparing last 30 minutes to first 30 minutes)
                const recentBars = premarketBars.slice(-30);
                const earlyBars = premarketBars.slice(0, 30);
                const recentAvg = recentBars.reduce((sum, bar) => sum + bar.c, 0) / Math.max(recentBars.length, 1);
                const earlyAvg = earlyBars.reduce((sum, bar) => sum + bar.c, 0) / Math.max(earlyBars.length, 1);
                const trend = recentAvg > earlyAvg ? 'up' : recentAvg < earlyAvg ? 'down' : 'flat';
                
                // Calculate RSI for pre-market bars
                const prices = premarketBars.map(bar => bar.c);
                const premarketRSI = calculateRSI(prices);
                
                // Calculate Bollinger Bands for pre-market
                const sma20 = prices.length >= 20 
                    ? prices.slice(-20).reduce((a, b) => a + b, 0) / 20
                    : prices.reduce((a, b) => a + b, 0) / prices.length;
                const variance = prices.slice(-20).map(p => Math.pow(p - sma20, 2)).reduce((a, b) => a + b, 0) / Math.min(20, prices.length);
                const stdDev = Math.sqrt(variance);
                
                return {
                    symbol,
                    premarketVolume,
                    premarketOpen: firstBar.o,
                    premarketLast: lastBar.c,
                    latestPrice: lastBar.c,  // Add this for price filtering
                    premarketHigh,
                    premarketLow,
                    premarketVWAP,
                    premarketRSI,
                    bollinger: {
                        upper: sma20 + (2 * stdDev),
                        middle: sma20,
                        lower: sma20 - (2 * stdDev)
                    },
                    premarketChange: lastBar.c - firstBar.o,
                    premarketChangePercent: ((lastBar.c - firstBar.o) / firstBar.o * 100),
                    premarketBars: premarketBars.length,
                    trend,
                    trendStrength: Math.abs((recentAvg - earlyAvg) / earlyAvg * 100)
                };
            }
        }
    } catch (error) {
        console.log(`Could not fetch pre-market data for ${symbol}`);
    }
    return null;
}

// After-hours watchlist - add stocks that are active after hours
const AFTERHOURS_WATCHLIST = ['HCWB', 'SPY', 'QQQ', 'TSLA', 'NVDA', 'AMD', 'AAPL', 'META', 'AMZN', 'GOOGL', 'MSFT', 'OPEN', 'TLRY', 'CMPO', 'YAAS', 'NXTT'];

// Get top gainers/most active stocks using live snapshots
async function fetchTopStocks() {
    try {
        console.log('📊 Fetching live most active stocks from market...');
        
        // Fetch specific watchlist stocks first
        const watchlistPromises = PREMARKET_WATCHLIST.map(async (symbol) => {
            try {
                const tickerUrl = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
                const tickerResponse = await axios.get(tickerUrl);
                return tickerResponse.data?.ticker;
            } catch (err) {
                console.log(`⚠️ Could not fetch ${symbol}: ${err.message}`);
                return null;
            }
        });
        
        const watchlistTickers = await Promise.all(watchlistPromises);
        const validWatchlistTickers = watchlistTickers.filter(t => t !== null);
        console.log(`📋 Fetched ${validWatchlistTickers.length} watchlist stocks`);
        
        // Use the snapshot endpoint to get live data for all tickers - fetch max to analyze
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=1000`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            // Combine watchlist with general active stocks
            const allTickers = [...validWatchlistTickers, ...response.data.tickers];
            
            // Remove duplicates based on ticker symbol
            const uniqueTickers = new Map();
            allTickers.forEach(t => {
                if (t && t.ticker) {
                    uniqueTickers.set(t.ticker, t);
                }
            });
            
            // Filter and sort by volume using live snapshot data
            const stocks = Array.from(uniqueTickers.values())
                .filter(t => {
                    // During pre-market: use t.min (minute bar) data
                    // During pre-market hours (4 AM - 9:30 AM): use t.premarket data first, then t.min
                    // During regular hours: use t.day data
                    // After hours: use t.min data (which contains after-hours trades)
                    const now = new Date();
                    const hour = now.getHours();
                    const minute = now.getMinutes();
                    const isPreMarketTime = hour >= 4 && hour < 9 || (hour === 9 && minute < 30);
                    
                    // During pre-market: min.av has accumulated volume, day fields are 0
                    // During regular hours: day.v has volume
                    const currentPrice = t.min?.c || t.day?.c || t.prevDay?.c || 0;
                    // CRITICAL FIX: Use accumulated volume (min.av) during pre-market, not min.v
                    const currentVolume = isPreMarketTime ? 
                        (t.min?.av || t.min?.v || 0) :  // Pre-market: use accumulated volume
                        (t.day?.v || t.prevDay?.v || 0); // Regular hours: use day volume
                    
                    return currentVolume > 10000 && // Lower threshold for pre-market (10k)
                           currentPrice > 0.5 &&     // Price > $0.50 
                           currentPrice < 2000;      // Price < $2000
                })
                .map(t => {
                    // Check if we're in pre-market hours
                    const now = new Date();
                    const hour = now.getHours();
                    const minute = now.getMinutes();
                    const isPreMarketTime = hour >= 4 && hour < 9 || (hour === 9 && minute < 30);
                    
                    // During pre-market, prioritize premarket data, then t.min has current minute bar data
                    // t.day is usually 0 during pre-market
                    // t.prevDay has the previous day's closing data
                    const currentPrice = t.premarket?.c || t.min?.c || t.day?.c || t.prevDay?.c || 0;
                    const previousClose = t.prevDay?.c || 0;
                    // Use pre-market specific volume during pre-market hours
                    const currentVolume = isPreMarketTime ? 
                        (t.premarket?.v || t.min?.v || t.min?.av || t.day?.v || 0) :
                        (t.min?.av || t.min?.v || t.day?.v || t.prevDay?.v || 0);
                    const currentHigh = t.min?.h || t.day?.h || t.prevDay?.h || 0;
                    const currentLow = t.min?.l || t.day?.l || t.prevDay?.l || 0;
                    const currentVWAP = t.min?.vw || t.day?.vw || t.prevDay?.vw || currentPrice;
                    
                    // Use the API's calculated change percentage or calculate it ourselves
                    let changePercent = t.todaysChangePerc || 0;
                    let priceChange = t.todaysChange || 0;
                    
                    // If API doesn't provide change, calculate it
                    if (changePercent === 0 && previousClose > 0 && currentPrice > 0) {
                        priceChange = currentPrice - previousClose;
                        changePercent = (priceChange / previousClose) * 100;
                    }
                    
                    // Check if we're in pre-market hours (reuse previously declared variables)
                    // Variables now, hour, minute, isPreMarketTime already declared above
                    
                    return {
                        symbol: t.ticker,
                        price: currentPrice,
                        volume: currentVolume,
                        change: priceChange,
                        changePercent: changePercent,
                        high: currentHigh,
                        low: currentLow,
                        vwap: currentVWAP,
                        previousClose: previousClose,
                        isPreMarket: isPreMarketTime
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

// Fetch after-hours specific stocks
async function fetchAfterHoursStocks() {
    try {
        console.log('🌙 Fetching after-hours movers...');
        
        // Fetch specific after-hours watchlist stocks first
        const watchlistPromises = AFTERHOURS_WATCHLIST.map(async (symbol) => {
            try {
                const tickerUrl = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
                const tickerResponse = await axios.get(tickerUrl);
                return tickerResponse.data?.ticker;
            } catch (err) {
                console.log(`⚠️ Could not fetch ${symbol}: ${err.message}`);
                return null;
            }
        });
        
        const watchlistTickers = await Promise.all(watchlistPromises);
        const validWatchlistTickers = watchlistTickers.filter(t => t !== null);
        console.log(`📋 Fetched ${validWatchlistTickers.length} after-hours watchlist stocks`);
        
        // Also get general most active stocks
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=500`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            // Combine watchlist with general active stocks
            const allTickers = [...validWatchlistTickers, ...response.data.tickers];
            
            // Remove duplicates
            const uniqueTickers = new Map();
            allTickers.forEach(t => {
                if (t && t.ticker) {
                    uniqueTickers.set(t.ticker, t);
                }
            });
            
            // Process and filter stocks
            const stocks = Array.from(uniqueTickers.values())
                .filter(t => {
                    const currentPrice = t.min?.c || t.day?.c || t.prevDay?.c || 0;
                    const currentVolume = t.min?.av || t.min?.v || t.day?.v || t.prevDay?.v || 0;
                    
                    return currentVolume > 1000 && // Lower threshold for after-hours
                           currentPrice > 0.5 &&
                           currentPrice < 2000;
                })
                .map(t => {
                    const currentPrice = t.min?.c || t.day?.c || t.prevDay?.c || 0;
                    const previousClose = t.prevDay?.c || 0;
                    const currentVolume = t.min?.av || t.min?.v || t.day?.v || t.prevDay?.v || 0;
                    const currentHigh = t.min?.h || t.day?.h || t.prevDay?.h || 0;
                    const currentLow = t.min?.l || t.day?.l || t.prevDay?.l || 0;
                    const currentVWAP = t.min?.vw || t.day?.vw || t.prevDay?.vw || currentPrice;
                    
                    let changePercent = t.todaysChangePerc || 0;
                    let priceChange = t.todaysChange || 0;
                    
                    if (changePercent === 0 && previousClose > 0 && currentPrice > 0) {
                        priceChange = currentPrice - previousClose;
                        changePercent = (priceChange / previousClose) * 100;
                    }
                    
                    return {
                        symbol: t.ticker,
                        price: currentPrice,
                        volume: currentVolume,
                        change: priceChange,
                        changePercent: changePercent,
                        high: currentHigh,
                        low: currentLow,
                        vwap: currentVWAP,
                        previousClose: previousClose,
                        isAfterHours: true
                    };
                })
                .sort((a, b) => {
                    // Sort by change percentage * volume for after-hours activity
                    const aActivity = Math.abs(a.changePercent) * a.volume;
                    const bActivity = Math.abs(b.changePercent) * b.volume;
                    return bActivity - aActivity;
                })
                .slice(0, 100);
            
            console.log(`✅ Found ${stocks.length} after-hours active stocks`);
            console.log(`🌙 Top 5 movers: ${stocks.slice(0, 5).map(s => s.symbol).join(', ')}`);
            
            return stocks;
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching after-hours stocks:', error.message);
        return [];
    }
}

// After-hours endpoint
app.get('/api/afterhours/top-movers', async (req, res) => {
    try {
        const stocks = await fetchAfterHoursStocks();
        
        const formattedStocks = stocks.slice(0, 50).map((stock, index) => {
            const ahChangePercent = stock.changePercent || 0;
            const ahVolume = stock.volume || 0;
            
            let signal = 'HOLD';
            if (ahVolume > 100000) {
                if (ahChangePercent > 2) signal = 'BUY';
                else if (ahChangePercent < -2) signal = 'SELL';
                else if (ahChangePercent > 1) signal = 'WATCH_BUY';
                else if (ahChangePercent < -1) signal = 'WATCH_SELL';
            }
            
            let momentum = 'neutral';
            if (ahChangePercent > 0.5) momentum = 'bullish';
            else if (ahChangePercent < -0.5) momentum = 'bearish';
            
            return {
                rank: index + 1,
                symbol: stock.symbol,
                afterHoursPrice: stock.price,
                afterHoursChange: stock.change,
                afterHoursChangePercent: ahChangePercent,
                afterHoursVolume: ahVolume,
                afterHoursHigh: stock.high,
                afterHoursLow: stock.low,
                regularClose: stock.previousClose,
                dayChange: stock.change,
                dayChangePercent: stock.changePercent,
                regularVolume: stock.volume,
                momentum: momentum,
                signal: signal,
                volumeSurge: ahVolume > 500000,
                unusualActivity: Math.abs(ahChangePercent) > 3,
                updateTime: new Date().toLocaleTimeString('en-US')
            };
        });
        
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const time = hour * 100 + minute;
        const day = now.getDay();
        
        let status = 'closed';
        let message = '';
        
        if (day === 0 || day === 6) {
            message = 'Market closed - Weekend';
        } else if (time >= 400 && time < 930) {
            status = 'pre-market';
            message = 'Pre-market trading';
        } else if (time >= 930 && time < 1600) {
            status = 'open';
            message = 'Regular trading hours';
        } else if (time >= 1600 && time < 2000) {
            status = 'after-hours';
            message = 'After-hours trading';
        } else {
            message = 'Market closed';
        }
        
        res.json({ 
            success: true, 
            stocks: formattedStocks,
            marketStatus: { status, message, currentTime: now.toLocaleTimeString('en-US') },
            updateTime: new Date().toLocaleTimeString('en-US')
        });
        
    } catch (error) {
        console.error('Error in /api/afterhours/top-movers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stocks/top-volume', async (req, res) => {
    try {
        // Check if this is a request for pre-market data (from premarket-dashboard)
        const isPremarketRequest = req.query.type === 'premarket' || req.headers.referer?.includes('premarket-dashboard');
        
        // First fetch the top stocks
        const stocks = await fetchTopStocks();
        
        // Always fetch pre-market data for pre-market dashboard or if cache is stale
        if (isPremarketRequest || !premarketCacheTime || Date.now() - premarketCacheTime > 120000) {
            console.log('🌅 Fetching fresh pre-market data for dashboard...');
            
            // Get symbols from top stocks (limit to top 50 to avoid too many API calls)
            const topStockSymbols = stocks.slice(0, 50).map(s => 
                typeof s === 'string' ? s : s.symbol
            ).filter(Boolean);
            
            // Combine with watchlist symbols for comprehensive coverage
            const allSymbols = [...new Set([...topStockSymbols, ...PREMARKET_WATCHLIST])];
            
            console.log(`📊 Fetching pre-market data for ${allSymbols.length} stocks...`);
            
            // Fetch pre-market data in batches to avoid rate limits
            const batchSize = 10;
            premarketDataCache.clear();
            
            for (let i = 0; i < allSymbols.length; i += batchSize) {
                const batch = allSymbols.slice(i, i + batchSize);
                const batchPromises = batch.map(symbol => 
                    fetchPreMarketDataForSymbol(symbol).catch(err => {
                        console.log(`⚠️ Failed to fetch pre-market data for ${symbol}`);
                        return null;
                    })
                );
                
                const batchResults = await Promise.all(batchPromises);
                
                batchResults.forEach(data => {
                    if (data && data.premarketVolume > 0) {
                        premarketDataCache.set(data.symbol, data);
                        console.log(`📊 ${data.symbol}: Pre-market volume = ${data.premarketVolume.toLocaleString()}`);
                    }
                });
                
                // Small delay between batches to avoid rate limiting
                if (i + batchSize < allSymbols.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            premarketCacheTime = Date.now();
            console.log(`✅ Pre-market data fetched for ${premarketDataCache.size} stocks`);
        }
        // Return in the format the dashboard expects
        const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : 100; // Default to $100 max
        const minVolume = req.query.minVolume ? parseInt(req.query.minVolume) : 100000; // Default 100k min volume
        
        const formattedStocks = stocks
            .map(stock => {
                // Attach pre-market data if available
                const symbol = typeof stock === 'string' ? stock : stock.symbol;
                const premarketData = premarketDataCache.get(symbol);
                if (premarketData && premarketData.premarketVolume > 0) {
                    return {
                        ...stock,
                        actualVolume: premarketData.premarketVolume,
                        hasPremarketData: true,
                        price: premarketData.latestPrice || stock.price || 0
                    };
                }
                return {
                    ...stock,
                    actualVolume: stock.volume || 0,
                    hasPremarketData: false
                };
            })
            .filter(stock => {
                // Filter by volume and price
                const hasVolume = stock.actualVolume > minVolume;
                const priceInRange = stock.price > 0.50 && stock.price <= maxPrice; // Min $0.50, max from query
                return hasVolume && priceInRange;
            })
            .sort((a, b) => b.actualVolume - a.actualVolume) // Sort by highest actual volume first
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
                // Get proper pre-market data if available
                const premarketData = premarketDataCache.get(stock.symbol);
                const actualVolume = premarketData ? premarketData.premarketVolume : stock.volume;
                const actualPrice = premarketData ? (premarketData.latestPrice || premarketData.premarketLast) : stock.price;
                const actualVWAP = premarketData ? premarketData.premarketVWAP : stock.vwap;
                const actualRSI = premarketData ? premarketData.premarketRSI : 50;
                const priceChange = premarketData ? premarketData.premarketChange : stock.change || 0;
                const priceChangePercent = premarketData ? premarketData.premarketChangePercent : (isFinite(stock.changePercent) ? stock.changePercent : 0);
                
                // Calculate MNAV Score (Market Normalized Activity Volume)
                // Based on: volume, price movement, trend, and liquidity
                let mnavScore = 50; // Base score
                
                // Volume component (0-30 points)
                if (actualVolume > 1000000) mnavScore += 30;
                else if (actualVolume > 500000) mnavScore += 20;
                else if (actualVolume > 100000) mnavScore += 10;
                else if (actualVolume > 50000) mnavScore += 5;
                
                // Price movement component (0-20 points)
                const absChange = Math.abs(priceChangePercent);
                if (absChange > 5) mnavScore += 20;
                else if (absChange > 3) mnavScore += 15;
                else if (absChange > 2) mnavScore += 10;
                else if (absChange > 1) mnavScore += 5;
                
                // Trend component (0-20 points)
                if (premarketData && premarketData.trend === 'up' && premarketData.trendStrength > 1) {
                    mnavScore += Math.min(20, premarketData.trendStrength * 4);
                } else if (premarketData && premarketData.trend === 'down' && premarketData.trendStrength > 1) {
                    mnavScore += Math.min(15, premarketData.trendStrength * 3);
                }
                
                // Price vs VWAP component (0-10 points)
                if (actualVWAP > 0) {
                    const vwapDiff = Math.abs((actualPrice - actualVWAP) / actualVWAP * 100);
                    if (vwapDiff > 2) mnavScore += 10;
                    else if (vwapDiff > 1) mnavScore += 5;
                }
                
                // Cap at 100
                mnavScore = Math.min(100, mnavScore);
                
                // Determine signal based on comprehensive analysis
                let signal = 'HOLD';
                if (mnavScore > 80 && priceChangePercent > 1 && premarketData?.trend === 'up') {
                    signal = 'STRONG_BUY';
                } else if (mnavScore > 70 && priceChangePercent > 0.5) {
                    signal = 'BUY';
                } else if (mnavScore > 80 && priceChangePercent < -1 && premarketData?.trend === 'down') {
                    signal = 'STRONG_SELL';
                } else if (mnavScore > 70 && priceChangePercent < -0.5) {
                    signal = 'SELL';
                } else if (mnavScore > 60) {
                    signal = priceChangePercent > 0 ? 'WATCH_BUY' : 'WATCH_SELL';
                }
                
                // Determine momentum
                let momentum = 'neutral';
                if (premarketData?.trend === 'up' && premarketData?.trendStrength > 0.5) {
                    momentum = premarketData.trendStrength > 2 ? 'strong_bullish' : 'bullish';
                } else if (premarketData?.trend === 'down' && premarketData?.trendStrength > 0.5) {
                    momentum = premarketData.trendStrength > 2 ? 'strong_bearish' : 'bearish';
                } else if (priceChangePercent > 0.5) {
                    momentum = 'bullish';
                } else if (priceChangePercent < -0.5) {
                    momentum = 'bearish';
                }
                
                return {
                    rank: index + 1,
                    symbol: stock.symbol,
                    companyName: stock.symbol,
                    price: actualPrice || 0,
                    priceChange: priceChange,
                    priceChangePercent: priceChangePercent,
                    volume: actualVolume || 0,
                    volumeRatio: 1.0,
                    vwap: actualVWAP || actualPrice || 0,
                    rsi: actualRSI || 50,
                    bollinger: premarketData?.bollinger || { upper: 0, middle: 0, lower: 0 },
                    momentum: momentum,
                    volumeSurge: actualVolume > 1000000,
                    signal: signal,
                    news: null,
                    mnavScore: mnavScore,
                    trend: premarketData?.trend || 'unknown',
                    trendStrength: premarketData?.trendStrength || 0,
                    updateTime: new Date().toLocaleTimeString('en-US')
                };
            });
        res.json({ success: true, stocks: formattedStocks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sector mapping for popular stocks
const SECTOR_MAPPING = {
    // Technology
    'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'META': 'Technology',
    'NVDA': 'Technology', 'AMD': 'Technology', 'INTC': 'Technology', 'ORCL': 'Technology',
    'CRM': 'Technology', 'ADBE': 'Technology', 'CSCO': 'Technology', 'IBM': 'Technology',
    'QCOM': 'Technology', 'TXN': 'Technology', 'AVGO': 'Technology', 'MU': 'Technology',
    
    // Financial
    'JPM': 'Financial', 'BAC': 'Financial', 'WFC': 'Financial', 'GS': 'Financial',
    'MS': 'Financial', 'C': 'Financial', 'BLK': 'Financial', 'SCHW': 'Financial',
    'AXP': 'Financial', 'USB': 'Financial', 'PNC': 'Financial', 'TFC': 'Financial',
    
    // Healthcare
    'JNJ': 'Healthcare', 'UNH': 'Healthcare', 'PFE': 'Healthcare', 'CVS': 'Healthcare',
    'ABBV': 'Healthcare', 'TMO': 'Healthcare', 'ABT': 'Healthcare', 'LLY': 'Healthcare',
    'MRK': 'Healthcare', 'DHR': 'Healthcare', 'MDT': 'Healthcare', 'BMY': 'Healthcare',
    
    // Consumer
    'AMZN': 'Consumer', 'TSLA': 'Consumer', 'WMT': 'Consumer', 'HD': 'Consumer',
    'NKE': 'Consumer', 'MCD': 'Consumer', 'SBUX': 'Consumer', 'TGT': 'Consumer',
    'COST': 'Consumer', 'LOW': 'Consumer', 'BABA': 'Consumer', 'JD': 'Consumer',
    
    // Energy
    'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy',
    'EOG': 'Energy', 'PSX': 'Energy', 'MPC': 'Energy', 'VLO': 'Energy',
    'OXY': 'Energy', 'HAL': 'Energy', 'BKR': 'Energy', 'DVN': 'Energy',
    
    // Industrial
    'BA': 'Industrial', 'CAT': 'Industrial', 'GE': 'Industrial', 'HON': 'Industrial',
    'UPS': 'Industrial', 'RTX': 'Industrial', 'DE': 'Industrial', 'LMT': 'Industrial',
    'MMM': 'Industrial', 'FDX': 'Industrial', 'EMR': 'Industrial', 'ETN': 'Industrial',
    
    // Materials
    'LIN': 'Materials', 'APD': 'Materials', 'SHW': 'Materials', 'FCX': 'Materials',
    'NEM': 'Materials', 'ECL': 'Materials', 'DD': 'Materials', 'DOW': 'Materials',
    
    // Utilities
    'NEE': 'Utilities', 'DUK': 'Utilities', 'SO': 'Utilities', 'D': 'Utilities',
    'AEP': 'Utilities', 'EXC': 'Utilities', 'SRE': 'Utilities', 'XEL': 'Utilities',
    
    // Real Estate
    'AMT': 'Real Estate', 'PLD': 'Real Estate', 'CCI': 'Real Estate', 'EQIX': 'Real Estate',
    'SPG': 'Real Estate', 'PSA': 'Real Estate', 'WELL': 'Real Estate', 'AVB': 'Real Estate',
    
    // Communication
    'DIS': 'Communication', 'NFLX': 'Communication', 'CMCSA': 'Communication', 'T': 'Communication',
    'VZ': 'Communication', 'TMUS': 'Communication', 'CHTR': 'Communication', 'EA': 'Communication'
};

// Sector heatmap endpoint
app.get('/api/sectors/heatmap', async (req, res) => {
    try {
        const stocks = await fetchTopStocks();
        const sectorData = {};
        
        // Initialize sectors
        const sectors = ['Technology', 'Financial', 'Healthcare', 'Consumer', 'Energy', 
                        'Industrial', 'Materials', 'Utilities', 'Real Estate', 'Communication'];
        
        sectors.forEach(sector => {
            sectorData[sector] = {
                totalVolume: 0,
                totalMarketCap: 0,
                avgPerformance: 0,
                stockCount: 0,
                topPerformers: [],
                worstPerformers: [],
                stocks: []
            };
        });
        
        // Process each stock
        stocks.forEach(stock => {
            const sector = SECTOR_MAPPING[stock.symbol] || 'Other';
            if (sector !== 'Other' && sectorData[sector]) {
                sectorData[sector].stocks.push({
                    symbol: stock.symbol,
                    price: stock.price,
                    changePercent: stock.changePercent || 0,
                    volume: stock.volume
                });
                sectorData[sector].totalVolume += stock.volume || 0;
                sectorData[sector].avgPerformance += stock.changePercent || 0;
                sectorData[sector].stockCount++;
            }
        });
        
        // Calculate averages and sort performers
        Object.keys(sectorData).forEach(sector => {
            const data = sectorData[sector];
            if (data.stockCount > 0) {
                data.avgPerformance = data.avgPerformance / data.stockCount;
                data.stocks.sort((a, b) => b.changePercent - a.changePercent);
                data.topPerformers = data.stocks.slice(0, 3);
                data.worstPerformers = data.stocks.slice(-3).reverse();
            }
        });
        
        res.json({ 
            success: true, 
            sectors: sectorData,
            timestamp: new Date().toISOString()
        });
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
const PORT = process.env.PORT || 3018;
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