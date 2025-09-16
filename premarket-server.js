const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

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

// Rocket Scanner - Explosive Mover Detection
const rocketCache = new Map();
const volumeHistory = new Map();
const priceHistory = new Map();
let rocketScanInterval = null;

// Market open tracking
const preMarketCloseData = new Map();
const openingRanges = new Map();
const gapAlertsSent = new Set();
let marketOpenHandled = false;

// Track 30-second price/volume changes
function trackAcceleration(symbol, price, volume) {
    if (!volumeHistory.has(symbol)) {
        volumeHistory.set(symbol, []);
        priceHistory.set(symbol, []);
    }
    
    const volHistory = volumeHistory.get(symbol);
    const priceHist = priceHistory.get(symbol);
    
    volHistory.push({ time: Date.now(), value: volume });
    priceHist.push({ time: Date.now(), value: price });
    
    // Keep only last 10 minutes of history
    const cutoff = Date.now() - 600000;
    volumeHistory.set(symbol, volHistory.filter(v => v.time > cutoff));
    priceHistory.set(symbol, priceHist.filter(p => p.time > cutoff));
}

// Calculate momentum (direction over last few minutes)
function calculateMomentum(symbol) {
    const priceHist = priceHistory.get(symbol) || [];
    
    if (priceHist.length < 2) return { direction: 'unknown', strength: 0, trend: '', is5MinDown: false };
    
    const now = Date.now();
    const currentPrice = priceHist[priceHist.length - 1];
    
    if (!currentPrice) return { direction: 'unknown', strength: 0, trend: '', is5MinDown: false };
    
    // Get price points at different intervals
    const oneMinAgo = priceHist.find(p => p.time <= now - 60000);
    const twoMinAgo = priceHist.find(p => p.time <= now - 120000);
    const threeMinAgo = priceHist.find(p => p.time <= now - 180000);
    const fiveMinAgo = priceHist.find(p => p.time <= now - 300000);
    
    let momentum = {
        direction: 'unknown',
        strength: 0,
        trend: '',
        priceChange1m: 0,
        priceChange2m: 0,
        priceChange5m: 0,
        is5MinDown: false,
        isDowntrend: false
    };
    
    // Calculate 5-minute change (MOST IMPORTANT FOR TREND)
    if (fiveMinAgo) {
        momentum.priceChange5m = ((currentPrice.value - fiveMinAgo.value) / fiveMinAgo.value) * 100;
        momentum.is5MinDown = momentum.priceChange5m < -0.1; // Down over 5 minutes
    }
    
    // Calculate shorter timeframe changes
    if (oneMinAgo) {
        momentum.priceChange1m = ((currentPrice.value - oneMinAgo.value) / oneMinAgo.value) * 100;
    }
    
    if (twoMinAgo) {
        momentum.priceChange2m = ((currentPrice.value - twoMinAgo.value) / twoMinAgo.value) * 100;
    }
    
    // Use 5-minute trend as primary indicator, fallback to shorter timeframes if not available
    let primaryTrend = 0;
    let trendPeriod = '';
    
    if (fiveMinAgo) {
        primaryTrend = momentum.priceChange5m;
        trendPeriod = '5m';
    } else if (threeMinAgo) {
        const change3m = ((currentPrice.value - threeMinAgo.value) / threeMinAgo.value) * 100;
        primaryTrend = change3m;
        trendPeriod = '3m';
    } else if (twoMinAgo) {
        primaryTrend = momentum.priceChange2m;
        trendPeriod = '2m';
    } else if (oneMinAgo) {
        primaryTrend = momentum.priceChange1m;
        trendPeriod = '1m';
    }
    
    // Determine direction and visual trend based on 5-minute (or best available) data
    if (primaryTrend > 0.1) {
        momentum.direction = 'up';
        momentum.strength = primaryTrend;
        momentum.isDowntrend = false;
        
        if (primaryTrend > 5) {
            momentum.trend = '🚀'; // Massive move up
        } else if (primaryTrend > 2) {
            momentum.trend = '⬆️'; // Strong up
        } else if (primaryTrend > 0.5) {
            momentum.trend = '↗️'; // Mild up
        } else {
            momentum.trend = '→'; // Flat-ish up
        }
    } else if (primaryTrend < -0.1) {
        momentum.direction = 'down';
        momentum.strength = Math.abs(primaryTrend);
        momentum.isDowntrend = true;
        
        if (primaryTrend < -5) {
            momentum.trend = '💀'; // Massive drop
        } else if (primaryTrend < -2) {
            momentum.trend = '📉'; // Strong down
        } else if (primaryTrend < -0.5) {
            momentum.trend = '↘️'; // Mild down
        } else {
            momentum.trend = '→'; // Flat-ish down
        }
    } else {
        momentum.direction = 'flat';
        momentum.trend = '→';
        momentum.strength = 0;
        momentum.isDowntrend = false;
    }
    
    // Add period indicator if we don't have full 5-minute data
    if (trendPeriod && trendPeriod !== '5m') {
        momentum.trendPeriod = trendPeriod;
    }
    
    // Check if accelerating (recent move stronger than earlier)
    if (oneMinAgo && twoMinAgo) {
        const recentMove = momentum.priceChange1m;
        const earlierMove = ((oneMinAgo.value - twoMinAgo.value) / twoMinAgo.value) * 100;
        // Only mark as accelerating if moving UP faster
        momentum.accelerating = recentMove > earlierMove && recentMove > 0.5;
    }
    
    return momentum;
}

// Detect acceleration
function detectAcceleration(symbol) {
    const volHistory = volumeHistory.get(symbol) || [];
    const priceHist = priceHistory.get(symbol) || [];
    
    if (volHistory.length < 2 || priceHist.length < 2) return null;
    
    // Get 30-second ago data
    const thirtySecAgo = Date.now() - 30000;
    const oldVol = volHistory.find(v => v.time <= thirtySecAgo);
    const oldPrice = priceHist.find(p => p.time <= thirtySecAgo);
    
    if (!oldVol || !oldPrice) return null;
    
    const currentVol = volHistory[volHistory.length - 1];
    const currentPrice = priceHist[priceHist.length - 1];
    
    const volChange = (currentVol.value - oldVol.value) / Math.max(oldVol.value, 1);
    const priceChange = ((currentPrice.value - oldPrice.value) / oldPrice.value) * 100;
    
    return {
        volumeAcceleration: volChange,
        priceAcceleration: priceChange,
        currentVolume: currentVol.value,
        currentPrice: currentPrice.value,
        timeframe: '30s'
    };
}

// Get current market session
function getMarketSession() {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const hour = easternTime.getHours();
    const minute = easternTime.getMinutes();
    const day = easternTime.getDay();
    
    // Weekend check
    if (day === 0 || day === 6) {
        return { session: 'closed', description: 'Weekend - Markets Closed' };
    }
    
    // Time-based sessions
    const time = hour * 100 + minute;
    
    // Check for market open transition (9:29-9:31 AM ET)
    if (time >= 929 && time <= 931) {
        if (!marketOpenHandled) {
            handleMarketOpen();
            marketOpenHandled = true;
        }
    } else if (time < 929 || time > 1000) {
        // Reset flag after market has been open for a while
        marketOpenHandled = false;
        if (time < 400) {
            // Reset for next day
            preMarketCloseData.clear();
            openingRanges.clear();
            gapAlertsSent.clear();
        }
    }
    
    if (time >= 400 && time < 930) {
        return { session: 'premarket', description: 'Pre-Market (4:00 AM - 9:30 AM ET)' };
    } else if (time >= 930 && time < 1600) {
        return { session: 'regular', description: 'Regular Hours (9:30 AM - 4:00 PM ET)' };
    } else if (time >= 1600 && time < 2000) {
        return { session: 'afterhours', description: 'After-Hours (4:00 PM - 8:00 PM ET)' };
    } else {
        return { session: 'closed', description: 'Market Closed' };
    }
}

// Handle market open transition
async function handleMarketOpen() {
    console.log('🔔 Market opening detected at 9:30 AM ET');
    
    // 1. Save pre-market closing prices
    for (const [symbol, history] of priceHistory) {
        if (history.length > 0) {
            const lastPrice = history[history.length - 1];
            preMarketCloseData.set(symbol, {
                price: lastPrice.value,
                time: lastPrice.time,
                history: [...history] // Preserve history
            });
        }
    }
    
    console.log(`📊 Saved pre-market closing data for ${preMarketCloseData.size} symbols`);
    
    // 2. Check for gaps after 30 seconds
    setTimeout(async () => {
        await checkForGaps();
    }, 30000);
    
    // 3. Track opening range (first 5 minutes)
    setTimeout(async () => {
        await lockInOpeningRanges();
    }, 300000); // 5 minutes after open
}

// Check for gap up/down at market open
async function checkForGaps() {
    console.log('🔍 Checking for gap up/down stocks...');
    const gaps = [];
    
    for (const [symbol, pmData] of preMarketCloseData) {
        try {
            const snapshot = await fetchSnapshot(symbol);
            if (snapshot && snapshot.price > 0) {
                const gapPercent = ((snapshot.price - pmData.price) / pmData.price) * 100;
                
                // Alert on gaps > 2%
                if (Math.abs(gapPercent) > 2) {
                    gaps.push({
                        symbol,
                        preMarketClose: pmData.price,
                        marketOpen: snapshot.price,
                        gapPercent,
                        volume: snapshot.volume,
                        type: gapPercent > 0 ? 'GAP_UP' : 'GAP_DOWN'
                    });
                    
                    // Send Discord alert for significant gaps
                    if (Math.abs(gapPercent) > 5 && !gapAlertsSent.has(symbol)) {
                        await sendGapAlert({
                            symbol,
                            preMarketClose: pmData.price,
                            marketOpen: snapshot.price,
                            gapPercent,
                            volume: snapshot.volume
                        });
                        gapAlertsSent.add(symbol);
                    }
                }
                
                // Preserve price history through transition
                if (pmData.history && pmData.history.length > 0) {
                    const existingHistory = priceHistory.get(symbol) || [];
                    // Keep last 10 minutes of pre-market history
                    const cutoff = Date.now() - 600000;
                    const preservedHistory = pmData.history.filter(h => h.time > cutoff);
                    priceHistory.set(symbol, [...preservedHistory, ...existingHistory]);
                }
            }
        } catch (error) {
            console.error(`Error checking gap for ${symbol}:`, error.message);
        }
    }
    
    if (gaps.length > 0) {
        console.log(`📈 Found ${gaps.length} gap stocks:`);
        gaps.sort((a, b) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent));
        gaps.slice(0, 10).forEach(g => {
            console.log(`  ${g.symbol}: ${g.type} ${g.gapPercent.toFixed(1)}%`);
        });
    }
    
    return gaps;
}

// Lock in opening range for ORB strategy
async function lockInOpeningRanges() {
    console.log('📊 Locking in 5-minute opening ranges...');
    
    for (const [symbol, history] of priceHistory) {
        // Get prices from last 5 minutes
        const cutoff = Date.now() - 300000;
        const openingPrices = history.filter(h => h.time > cutoff);
        
        if (openingPrices.length > 0) {
            const high = Math.max(...openingPrices.map(p => p.value));
            const low = Math.min(...openingPrices.map(p => p.value));
            const range = high - low;
            
            openingRanges.set(symbol, {
                high,
                low,
                range,
                timestamp: Date.now()
            });
        }
    }
    
    console.log(`🎯 Locked in opening ranges for ${openingRanges.size} symbols`);
}

// Check for opening range breakout
function checkORBreakout(symbol, currentPrice) {
    const range = openingRanges.get(symbol);
    if (!range) return null;
    
    // Only check after opening range is established (after 9:35 AM)
    const now = Date.now();
    if (now - range.timestamp < 0) return null;
    
    if (currentPrice > range.high * 1.001) { // 0.1% above high
        return {
            type: 'BREAKOUT_UP',
            level: range.high,
            percent: ((currentPrice - range.high) / range.high) * 100
        };
    } else if (currentPrice < range.low * 0.999) { // 0.1% below low
        return {
            type: 'BREAKDOWN',
            level: range.low,
            percent: ((range.low - currentPrice) / range.low) * 100
        };
    }
    
    return null;
}

// Send gap alert to Discord
async function sendGapAlert(gapData) {
    if (!adminSettings.webhooks.rocket) return;
    
    const emoji = gapData.gapPercent > 0 ? '🟢' : '🔴';
    const direction = gapData.gapPercent > 0 ? 'UP' : 'DOWN';
    
    const embed = {
        embeds: [{
            title: `${emoji} GAP ${direction}: ${gapData.symbol}`,
            description: `Market open gap detected!`,
            color: gapData.gapPercent > 0 ? 0x00FF00 : 0xFF0000,
            fields: [
                {
                    name: 'Pre-Market Close',
                    value: `$${gapData.preMarketClose.toFixed(2)}`,
                    inline: true
                },
                {
                    name: 'Market Open',
                    value: `$${gapData.marketOpen.toFixed(2)}`,
                    inline: true
                },
                {
                    name: 'Gap %',
                    value: `${gapData.gapPercent > 0 ? '+' : ''}${gapData.gapPercent.toFixed(2)}%`,
                    inline: true
                },
                {
                    name: 'Volume',
                    value: formatVolume(gapData.volume),
                    inline: true
                }
            ],
            footer: {
                text: 'Market Open Gap Alert'
            },
            timestamp: new Date().toISOString()
        }]
    };
    
    try {
        await axios.post(adminSettings.webhooks.rocket, embed);
        console.log(`✅ Gap alert sent for ${gapData.symbol}`);
    } catch (error) {
        console.error('Failed to send gap alert:', error.message);
    }
}

// Send ORB breakout alert
async function sendORBAlert(data) {
    if (!adminSettings.webhooks.rocket) return;
    
    const emoji = data.orbSignal.type === 'BREAKOUT_UP' ? '🚀' : '📉';
    const color = data.orbSignal.type === 'BREAKOUT_UP' ? 0x00FF00 : 0xFF0000;
    
    const embed = {
        embeds: [{
            title: `${emoji} ORB ${data.orbSignal.type === 'BREAKOUT_UP' ? 'BREAKOUT' : 'BREAKDOWN'}: ${data.symbol}`,
            description: `Opening range ${data.orbSignal.type === 'BREAKOUT_UP' ? 'breakout' : 'breakdown'} detected!`,
            color: color,
            fields: [
                {
                    name: 'Current Price',
                    value: `$${data.price.toFixed(2)}`,
                    inline: true
                },
                {
                    name: data.orbSignal.type === 'BREAKOUT_UP' ? 'Broke Above' : 'Broke Below',
                    value: `$${data.orbSignal.level.toFixed(2)}`,
                    inline: true
                },
                {
                    name: 'Move %',
                    value: `${data.orbSignal.percent.toFixed(2)}%`,
                    inline: true
                },
                {
                    name: 'Volume',
                    value: formatVolume(data.volume),
                    inline: true
                }
            ],
            footer: {
                text: 'Opening Range Breakout Alert'
            },
            timestamp: new Date().toISOString()
        }]
    };
    
    try {
        await axios.post(adminSettings.webhooks.rocket, embed);
        console.log(`✅ ORB alert sent for ${data.symbol}`);
    } catch (error) {
        console.error('Failed to send ORB alert:', error.message);
    }
}

// Fetch stocks based on current session
async function fetchSessionStocks() {
    const { session } = getMarketSession();
    
    switch(session) {
        case 'premarket':
            return await fetchPreMarketMovers();
        case 'afterhours':
            return await fetchAfterHoursMovers();
        case 'regular':
            return await fetchTopStocks();
        default:
            // During closed hours, return last session's data
            return await fetchTopStocks();
    }
}

// Fetch pre-market movers
async function fetchPreMarketMovers() {
    console.log('🌅 Fetching PRE-MARKET movers...');
    try {
        // Get pre-market gainers/losers
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        const stocks = [];
        if (response.data && response.data.tickers) {
            for (const ticker of response.data.tickers) {
                // Get pre-market data from snapshot
                const snapshot = await fetchSnapshot(ticker.ticker);
                if (snapshot && snapshot.preMarket) {
                    stocks.push({
                        ...snapshot,
                        symbol: ticker.ticker,
                        price: snapshot.preMarket.c || snapshot.price,
                        volume: snapshot.preMarket.v || 0,
                        changePercent: ((snapshot.preMarket.c - snapshot.prevClose) / snapshot.prevClose) * 100,
                        session: 'premarket'
                    });
                }
            }
        }
        
        // Also check our watchlist for pre-market activity
        const watchlist = await fetchWatchlistStocks();
        stocks.push(...watchlist.filter(s => s.volume > 100000));
        
        return stocks.sort((a, b) => b.volume - a.volume);
    } catch (error) {
        console.error('Pre-market fetch error:', error.message);
        return await fetchTopStocks(); // Fallback
    }
}

// Fetch after-hours movers
async function fetchAfterHoursMovers() {
    console.log('🌙 Fetching AFTER-HOURS movers...');
    try {
        const stocks = [];
        
        // Get top volume stocks first
        const topStocks = await fetchTopStocks();
        
        // Check for after-hours data
        for (const stock of topStocks.slice(0, 50)) {
            const snapshot = await fetchSnapshot(stock.symbol);
            if (snapshot && snapshot.afterHours) {
                stocks.push({
                    ...stock,
                    price: snapshot.afterHours.c || stock.price,
                    volume: snapshot.afterHours.v || stock.volume,
                    changePercent: ((snapshot.afterHours.c - stock.price) / stock.price) * 100,
                    session: 'afterhours'
                });
            } else {
                stocks.push({ ...stock, session: 'afterhours' });
            }
        }
        
        return stocks;
    } catch (error) {
        console.error('After-hours fetch error:', error.message);
        return await fetchTopStocks(); // Fallback
    }
}

// Rocket scanner endpoint with session awareness
app.get('/api/rockets/scan', async (req, res) => {
    try {
        const marketSession = getMarketSession();
        console.log(`🚀 Scanning for rockets - ${marketSession.description}`);
        
        const stocks = await fetchSessionStocks();
        const rockets = [];
        
        // Also fetch top gainers to catch stocks like IMTE
        try {
            const gainersUrl = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${POLYGON_API_KEY}`;
            const gainersResponse = await axios.get(gainersUrl);
            
            if (gainersResponse.data && gainersResponse.data.tickers) {
                for (const ticker of gainersResponse.data.tickers) {
                    const changePercent = ((ticker.todaysChange / ticker.prevDay.c) * 100);
                    stocks.push({
                        symbol: ticker.ticker,
                        price: ticker.day.c,
                        changePercent: changePercent,
                        volume: ticker.day.v,
                        vwap: ticker.day.vw,
                        session: marketSession.session
                    });
                }
            }
        } catch (error) {
            console.log('Could not fetch gainers:', error.message);
        }
        
        for (const stock of stocks.slice(0, 200)) { // Check top 200 stocks + all gainers
            const symbol = stock.symbol;
            const price = stock.price;
            const volume = stock.volume;
            
            // Track for acceleration
            trackAcceleration(symbol, price, volume);
            
            // Check acceleration
            const accel = detectAcceleration(symbol);
            
            // Calculate momentum FIRST to check if stock is in downtrend
            const momentum = calculateMomentum(symbol);
            const hasValidMomentum = momentum && priceHistory.get(symbol)?.length > 2;
            
            // Check for ORB breakout during regular hours
            let orbSignal = null;
            if (marketSession.session === 'regular') {
                orbSignal = checkORBreakout(symbol, price);
            }
            
            // Check for rocket conditions
            // EXCLUDE stocks in 5-minute downtrend unless they have exceptional signals
            const isDowntrending = momentum.isDowntrend || momentum.is5MinDown;
            
            // More strict for downtrending stocks
            const isRocket = isDowntrending ? 
                // For downtrending stocks, require EXCEPTIONAL signals
                (stock.changePercent > 50 || // Huge day move despite recent dip
                (stock.changePercent > 30 && volume > 5000000) || // Big move with massive volume
                (orbSignal && orbSignal.type === 'BREAKOUT_UP' && stock.changePercent > 10)) // ORB breakout with good day gain
                :
                // Normal criteria for non-downtrending stocks
                ((stock.changePercent > 20) || // >20% move alone is enough
                (stock.changePercent > 10 && volume > 1000000) || // >10% with good volume
                (stock.changePercent > 5 && accel && accel.volumeAcceleration > 10) || // moderate move with huge volume
                (volume > 500000 && accel && accel.volumeAcceleration > 5) || // volume spike
                (orbSignal && orbSignal.type === 'BREAKOUT_UP')); // ORB breakout
            
            if (isRocket) {
                // Send ORB alert if detected
                if (orbSignal && !rocketCache.has(`${symbol}_ORB_${orbSignal.type}`)) {
                    await sendORBAlert({
                        symbol,
                        price,
                        orbSignal,
                        volume
                    });
                    rocketCache.set(`${symbol}_ORB_${orbSignal.type}`, true);
                }
                // Try to get news
                const news = await fetchLatestNews(symbol);
                
                // Momentum already calculated above for filtering
                
                // Check if this is a gap stock
                const pmData = preMarketCloseData.get(symbol);
                let gapInfo = null;
                if (pmData && marketSession.session === 'regular') {
                    const gapPercent = ((price - pmData.price) / pmData.price) * 100;
                    if (Math.abs(gapPercent) > 2) {
                        gapInfo = {
                            type: gapPercent > 0 ? 'GAP_UP' : 'GAP_DOWN',
                            percent: gapPercent,
                            preMarketClose: pmData.price
                        };
                    }
                }
                
                // Get opening range info
                const orRange = openingRanges.get(symbol);
                
                const rocketData = {
                    symbol: symbol,
                    price: price,
                    changePercent: stock.changePercent,
                    volume: volume,
                    vwap: stock.vwap || price,
                    rsi: stock.rsi || 50,
                    acceleration: accel,
                    momentum: hasValidMomentum ? momentum : null,
                    trend: hasValidMomentum ? momentum.trend : null,
                    direction: hasValidMomentum ? momentum.direction : 'unknown',
                    accelerating: hasValidMomentum ? (momentum.accelerating || false) : false,
                    news: news ? news.headline : null,
                    newsDescription: news ? news.description : null,
                    newsTime: news ? news.timestamp : null,
                    newsSource: news ? news.source : null,
                    float: stock.float || null,
                    halted: stock.halted || false,
                    level: getRocketLevel(stock, accel),
                    session: stock.session || marketSession.session,
                    gap: gapInfo,
                    orbSignal: orbSignal,
                    openingRange: orRange,
                    timestamp: new Date().toISOString()
                };
                
                rockets.push(rocketData);
                
                // Send Discord alert for significant rockets (not already sent)
                const rocketKey = `${symbol}_${Math.floor(stock.changePercent)}_${marketSession.session}`;
                if (!sentRockets.has(rocketKey) && adminSettings.webhooks.rocket) {
                    // Alert for level 2+ rockets or any rocket with >15% gain or high volume
                    if (rocketData.level >= 2 || 
                        stock.changePercent >= 15 || 
                        (volume > 5000000 && stock.changePercent > 5)) {
                        
                        await sendDiscordAlert(rocketData, 'rocket');
                        sentRockets.add(rocketKey);
                        
                        // Keep set size manageable
                        if (sentRockets.size > 500) {
                            // Remove oldest entries (keep recent half)
                            const keysArray = Array.from(sentRockets);
                            sentRockets.clear();
                            keysArray.slice(-250).forEach(key => sentRockets.add(key));
                        }
                    }
                }
            }
        }
        
        // Sort by level and change percent
        rockets.sort((a, b) => {
            if (a.level !== b.level) return b.level - a.level;
            return b.changePercent - a.changePercent;
        });
        
        res.json({ 
            success: true, 
            rockets: rockets,
            marketSession: marketSession,
            scanTime: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get rocket alert level
function getRocketLevel(stock, accel) {
    const change = Math.abs(stock.changePercent);
    const volume = stock.volume;
    const volAccel = accel ? accel.volumeAcceleration : 1;
    
    if (change >= 100 && volume >= 5000000 && volAccel > 10) return 4; // JACKPOT
    if (change >= 50 && volume >= 1000000 && volAccel > 5) return 3;   // URGENT
    if (change >= 20 && volume >= 500000) return 2;                     // ALERT
    return 1; // WATCH
}

// Fetch latest news for symbol
async function fetchLatestNews(symbol) {
    try {
        // Try Polygon news API first
        const url = `${POLYGON_BASE_URL}/v2/reference/news?ticker=${symbol}&limit=1&apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        
        if (response.data && response.data.results && response.data.results.length > 0) {
            const news = response.data.results[0];
            return {
                headline: news.title,
                description: news.description,
                timestamp: news.published_utc,
                source: news.publisher.name
            };
        }
    } catch (error) {
        console.log(`Could not fetch news for ${symbol}`);
    }
    return null;
}

// News aggregation endpoint
app.get('/api/news/breaking', async (req, res) => {
    try {
        // Aggregate from multiple sources
        const news = [];
        
        // Polygon news
        const polygonUrl = `${POLYGON_BASE_URL}/v2/reference/news?limit=20&apiKey=${POLYGON_API_KEY}`;
        const polygonResponse = await axios.get(polygonUrl);
        
        if (polygonResponse.data && polygonResponse.data.results) {
            polygonResponse.data.results.forEach(item => {
                news.push({
                    id: item.id,
                    headline: item.title,
                    description: item.description,
                    symbol: item.tickers ? item.tickers[0] : null,
                    timestamp: item.published_utc,
                    source: item.publisher.name,
                    url: item.article_url
                });
            });
        }
        
        res.json({ success: true, news: news });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Halt detection endpoint
app.get('/api/halts', async (req, res) => {
    try {
        // This would need a real halt data source
        // For now, return empty array
        res.json({ success: true, halts: [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin settings storage with file persistence
const SETTINGS_FILE = path.join(__dirname, 'admin-settings.json');

let adminSettings = {
    webhooks: {
        rocket: '',
        news: '',
        urgent: ''
    },
    thresholds: {
        l1: { price: 10, volume: 500000 },
        l2: { price: 20, volume: 500000 },
        l3: { price: 50, volume: 1000000 },
        l4: { price: 100, volume: 5000000 }
    },
    scanInterval: 30,
    volumeMultiplier: 5,
    premarketEnabled: true,
    afterhoursEnabled: true,
    newsEnabled: true,
    haltEnabled: true
};

// Load settings from file on startup
async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        const loadedSettings = JSON.parse(data);
        adminSettings = { ...adminSettings, ...loadedSettings };
        console.log('✅ Admin settings loaded from file');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📝 No settings file found, using defaults');
            await saveSettings();
        } else {
            console.error('❌ Error loading settings:', error.message);
        }
    }
}

// Save settings to file
async function saveSettings() {
    try {
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(adminSettings, null, 2));
        console.log('💾 Admin settings saved to file');
    } catch (error) {
        console.error('❌ Error saving settings:', error.message);
    }
}

// Admin stats
const adminStats = {
    totalAlerts: 0,
    todayAlerts: 0,
    activeMonitoring: 0,
    startTime: new Date().toISOString()
};

// Admin API: Get settings
app.get('/api/admin/settings', (req, res) => {
    res.json({ success: true, settings: adminSettings });
});

// Admin API: Save webhooks
app.post('/api/admin/webhooks', async (req, res) => {
    const { webhooks } = req.body;
    if (webhooks) {
        adminSettings.webhooks = { ...adminSettings.webhooks, ...webhooks };
        await saveSettings();
        res.json({ success: true, message: 'Webhooks saved successfully' });
    } else {
        res.status(400).json({ success: false, error: 'Invalid webhooks' });
    }
});

// Admin API: Save thresholds
app.post('/api/admin/thresholds', async (req, res) => {
    const { thresholds } = req.body;
    if (thresholds) {
        adminSettings.thresholds = { ...adminSettings.thresholds, ...thresholds };
        await saveSettings();
        res.json({ success: true, message: 'Thresholds saved successfully' });
    } else {
        res.status(400).json({ success: false, error: 'Invalid thresholds' });
    }
});

// Admin API: Save general settings
app.post('/api/admin/settings', async (req, res) => {
    const { settings } = req.body;
    if (settings) {
        Object.assign(adminSettings, settings);
        await saveSettings();
        res.json({ success: true, message: 'Settings saved successfully' });
    } else {
        res.status(400).json({ success: false, error: 'Invalid settings' });
    }
});

// Admin API: Test webhook
app.post('/api/admin/test-webhook', async (req, res) => {
    const { type, webhookUrl } = req.body;
    
    if (!webhookUrl || !webhookUrl.includes('discord.com')) {
        return res.status(400).json({ success: false, error: 'Invalid webhook URL' });
    }
    
    try {
        const testData = {
            rocket: {
                embeds: [{
                    title: '🚀 TEST ROCKET ALERT',
                    description: 'This is a test alert from your Rocket Scanner Admin Panel',
                    color: 0xFF6432,
                    fields: [
                        { name: 'Symbol', value: 'TEST', inline: true },
                        { name: 'Price', value: '$99.99', inline: true },
                        { name: 'Change', value: '+999%', inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }]
            },
            news: {
                embeds: [{
                    title: '📰 TEST NEWS ALERT',
                    description: 'Breaking: This is a test news alert from your admin panel',
                    color: 0xFFC832,
                    fields: [
                        { name: 'Source', value: 'Admin Test', inline: true },
                        { name: 'Impact', value: 'High', inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }]
            },
            urgent: {
                embeds: [{
                    title: '🔥 TEST URGENT ALERT',
                    description: 'URGENT: This is a test urgent alert - Level 4 JACKPOT simulation',
                    color: 0xFF0000,
                    fields: [
                        { name: 'Level', value: 'JACKPOT', inline: true },
                        { name: 'Action', value: 'TEST ONLY', inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }]
            }
        };
        
        const payload = testData[type] || testData.rocket;
        const response = await axios.post(webhookUrl, payload);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook test error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin API: Get stats
app.get('/api/admin/stats', (req, res) => {
    adminStats.activeMonitoring = 0; // Will track active monitoring when rockets feature is active
    res.json({ success: true, stats: adminStats });
});

// Admin API: Clear stats
app.post('/api/admin/stats/clear', (req, res) => {
    adminStats.totalAlerts = 0;
    adminStats.todayAlerts = 0;
    res.json({ success: true });
});

// Track sent news to avoid duplicates
const sentNewsIds = new Set();
const sentRockets = new Set();

// Start news scanner
function startNewsScanner() {
    // Initial scan on startup
    scanForNews();
    
    // Check for breaking news every 60 seconds
    setInterval(scanForNews, 60000); // Every 1 minute
}

async function scanForNews() {
    if (!adminSettings.webhooks.news) return;
    
    try {
        // Get more news items and include market-moving keywords
        const polygonUrl = `${POLYGON_BASE_URL}/v2/reference/news?limit=25&apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(polygonUrl);
        
        if (response.data && response.data.results) {
            let newsCount = 0;
            
            for (const newsItem of response.data.results) {
                // Skip if already sent
                if (sentNewsIds.has(newsItem.id)) continue;
                
                // Check if news is recent (last 2 hours for more coverage)
                const newsTime = new Date(newsItem.published_utc);
                const now = new Date();
                const ageMinutes = (now - newsTime) / 60000;
                
                // Send news from last 2 hours
                if (ageMinutes <= 120) {
                    // Check for important keywords that indicate market-moving news
                    const title = (newsItem.title || '').toLowerCase();
                    const isImportant = 
                        title.includes('fda') ||
                        title.includes('earnings') ||
                        title.includes('merger') ||
                        title.includes('acquisition') ||
                        title.includes('bankrupt') ||
                        title.includes('halted') ||
                        title.includes('investigation') ||
                        title.includes('approval') ||
                        title.includes('lawsuit') ||
                        title.includes('recall');
                    
                    // Send all news from last 30 min, or important news from last 2 hours
                    if (ageMinutes <= 30 || isImportant) {
                        await sendNewsAlert(newsItem);
                        sentNewsIds.add(newsItem.id);
                        newsCount++;
                        
                        // Keep set size manageable
                        if (sentNewsIds.size > 1000) {
                            const idsArray = Array.from(sentNewsIds);
                            sentNewsIds.clear();
                            idsArray.slice(-500).forEach(id => sentNewsIds.add(id));
                        }
                    }
                }
            }
            
            if (newsCount > 0) {
                console.log(`📰 Sent ${newsCount} news alerts`);
            }
        }
    } catch (error) {
        console.error('News scan error:', error.message);
    }
}

// Start rocket scanner
function startRocketScanner() {
    // Initial scan
    scanAndAlertRockets();
    
    // Check for rockets every 2 minutes during market hours
    setInterval(async () => {
        await scanAndAlertRockets();
    }, 120000); // Every 2 minutes
}

// Scan for rockets and send Discord alerts
async function scanAndAlertRockets() {
    const session = getMarketSession();
    if (!session || session.session === 'closed' || !adminSettings.webhooks.rocket) return;
    
    try {
        console.log('🔍 Scanning for rocket alerts...');
        
        // Use the same logic as the main scan endpoint
        const response = await axios.get(`http://localhost:3018/api/rockets/scan`);
        
        if (response.data && response.data.rockets) {
            const rockets = response.data.rockets;
            let alertCount = 0;
            
            for (const rocket of rockets) {
                const rocketKey = `${rocket.symbol}_${Math.floor(rocket.changePercent)}_${session.session}`;
                
                // Alert for significant rockets not already sent
                if (!sentRockets.has(rocketKey)) {
                    // Alert criteria: level 2+, >15% gain, or high volume movers
                    if (rocket.level >= 2 || 
                        rocket.changePercent >= 15 || 
                        (rocket.volume > 5000000 && rocket.changePercent > 5)) {
                        
                        await sendDiscordAlert(rocket, 'rocket');
                        sentRockets.add(rocketKey);
                        alertCount++;
                        
                        // Log the alert
                        console.log(`🚀 Alert sent: ${rocket.symbol} +${rocket.changePercent.toFixed(1)}% Vol: ${(rocket.volume/1000000).toFixed(1)}M`);
                    }
                }
            }
            
            if (alertCount > 0) {
                console.log(`✅ Sent ${alertCount} rocket alerts`);
            }
            
            // Clean up old entries periodically
            if (sentRockets.size > 500) {
                const keysArray = Array.from(sentRockets);
                sentRockets.clear();
                keysArray.slice(-250).forEach(key => sentRockets.add(key));
            }
        }
    } catch (error) {
        console.error('Rocket alert scan error:', error.message);
    }
}

// Send news alert to Discord
async function sendNewsAlert(newsItem) {
    if (!adminSettings.webhooks.news) return;
    
    try {
        const embed = {
            embeds: [{
                title: `📰 ${newsItem.title}`,
                description: newsItem.description ? newsItem.description.substring(0, 500) : '',
                url: newsItem.article_url,
                color: 0x0099FF,
                fields: [
                    {
                        name: 'Symbols',
                        value: newsItem.tickers ? newsItem.tickers.join(', ') : 'General Market',
                        inline: true
                    },
                    {
                        name: 'Publisher',
                        value: newsItem.publisher.name || 'Unknown',
                        inline: true
                    }
                ],
                footer: {
                    text: 'Rocket Scanner News Alert'
                },
                timestamp: newsItem.published_utc
            }]
        };
        
        await axios.post(adminSettings.webhooks.news, embed);
        console.log(`📰 News alert sent: ${newsItem.title.substring(0, 50)}...`);
    } catch (error) {
        console.error('Failed to send news alert:', error.message);
    }
}

// Send Discord alert with admin webhooks
async function sendDiscordAlert(rocket, type = 'rocket') {
    const webhook = type === 'news' ? adminSettings.webhooks.news : 
                   (rocket.level >= 3 && adminSettings.webhooks.urgent) ? 
                   adminSettings.webhooks.urgent : 
                   adminSettings.webhooks.rocket;
    
    if (!webhook || !webhook.includes('discord.com')) return;
    
    const color = rocket.level === 4 ? 0xFF0000 :
                  rocket.level === 3 ? 0xFF6432 :
                  rocket.level === 2 ? 0xFFC832 :
                  0x6464FF;
    
    const levelText = rocket.level === 4 ? '🚀 JACKPOT' :
                      rocket.level === 3 ? '🔥 URGENT' :
                      rocket.level === 2 ? '⚡ ALERT' :
                      '👀 WATCH';
    
    const embed = {
        embeds: [{
            title: `${levelText}: ${rocket.symbol}`,
            description: rocket.news || 'No news catalyst detected',
            color: color,
            fields: [
                { name: 'Price', value: `$${rocket.price.toFixed(2)}`, inline: true },
                { name: 'Change', value: `+${rocket.changePercent.toFixed(1)}%`, inline: true },
                { name: 'Volume', value: formatVolume(rocket.volume), inline: true },
                { name: 'VWAP', value: `$${rocket.vwap.toFixed(2)}`, inline: true },
                { name: 'RSI', value: rocket.rsi.toFixed(1), inline: true },
                { name: 'Acceleration', value: rocket.acceleration ? 
                  `${rocket.acceleration.volumeAcceleration.toFixed(1)}x` : 'N/A', inline: true }
            ],
            footer: {
                text: 'Rocket Scanner Alert • Manage your risk!'
            },
            timestamp: new Date().toISOString()
        }]
    };
    
    try {
        await axios.post(webhook, embed);
        adminStats.totalAlerts++;
        adminStats.todayAlerts++;
        console.log(`✅ Discord alert sent for ${rocket.symbol} to ${type} webhook`);
    } catch (error) {
        console.error('Discord webhook error:', error.message);
    }
}

function formatVolume(vol) {
    if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(0) + 'K';
    return vol.toString();
}

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
    
    // Load admin settings from file
    await loadSettings();
    
    // Load initial data
    await fetchTopStocks();
    
    // Start news scanning for Discord alerts
    console.log('📰 Starting news scanner for Discord alerts...');
    startNewsScanner();
    
    // Start rocket scanner for Discord alerts
    console.log('🚀 Starting rocket scanner for Discord alerts...');
    startRocketScanner();
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