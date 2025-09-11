const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Polygon.io configuration
const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Cache
let topStocks = [];
let stockCache = new Map();

// After-hours watchlist - stocks that often have high after-hours volume
const AFTERHOURS_WATCHLIST = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AMD', 'AAPL', 'META', 'AMZN', 'GOOGL', 'MSFT'];

// Get top after-hours movers
async function fetchAfterHoursStocks() {
    try {
        console.log('🌙 Fetching after-hours movers...');
        
        // Fetch specific watchlist stocks first
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
        console.log(`📋 Fetched ${validWatchlistTickers.length} watchlist stocks`);
        
        // Get all active stocks
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=1000`;
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
            
            // Process and filter for after-hours activity
            const stocks = Array.from(uniqueTickers.values())
                .map(t => {
                    // Get regular hours close price
                    const regularClose = t.day?.c || t.prevDay?.c || 0;
                    
                    // After-hours data (if available)
                    const afterHoursPrice = t.min?.c || regularClose;
                    const afterHoursVolume = t.min?.v || 0;
                    const afterHoursHigh = t.min?.h || regularClose;
                    const afterHoursLow = t.min?.l || regularClose;
                    
                    // Calculate after-hours change from regular close
                    const afterHoursChange = afterHoursPrice - regularClose;
                    const afterHoursChangePercent = regularClose > 0 ? (afterHoursChange / regularClose) * 100 : 0;
                    
                    // Regular hours data
                    const regularVolume = t.day?.v || t.prevDay?.v || 0;
                    const dayChange = t.todaysChange || 0;
                    const dayChangePercent = t.todaysChangePerc || 0;
                    
                    return {
                        symbol: t.ticker,
                        // After-hours specific data
                        afterHoursPrice: afterHoursPrice,
                        afterHoursChange: afterHoursChange,
                        afterHoursChangePercent: afterHoursChangePercent,
                        afterHoursVolume: afterHoursVolume,
                        afterHoursHigh: afterHoursHigh,
                        afterHoursLow: afterHoursLow,
                        // Regular hours data for comparison
                        regularClose: regularClose,
                        regularVolume: regularVolume,
                        dayChange: dayChange,
                        dayChangePercent: dayChangePercent,
                        // Combined volume for sorting
                        totalVolume: regularVolume + afterHoursVolume,
                        // Check if there's actual after-hours activity
                        hasAfterHoursActivity: afterHoursVolume > 0 || Math.abs(afterHoursChange) > 0.01
                    };
                })
                // Filter for stocks with after-hours activity or high regular volume
                .filter(s => s.hasAfterHoursActivity || s.regularVolume > 1000000)
                .sort((a, b) => {
                    // Sort by after-hours change percentage (most volatile first)
                    const aActivity = Math.abs(a.afterHoursChangePercent) * (a.afterHoursVolume || 1);
                    const bActivity = Math.abs(b.afterHoursChangePercent) * (b.afterHoursVolume || 1);
                    return bActivity - aActivity;
                })
                .slice(0, 100); // Get top 100
            
            topStocks = stocks.map(s => s.symbol);
            console.log(`✅ Found ${stocks.length} stocks with after-hours activity`);
            console.log(`🌙 Top 5 movers: ${topStocks.slice(0, 5).join(', ')}`);
            
            // Cache the data
            stocks.forEach(s => {
                stockCache.set(s.symbol, s);
            });
            
            return stocks;
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching after-hours data:', error.message);
        return [];
    }
}

// API endpoint for after-hours movers
app.get('/api/afterhours/top-movers', async (req, res) => {
    try {
        const stocks = await fetchAfterHoursStocks();
        
        const formattedStocks = stocks.slice(0, 50).map((stock, index) => {
            // Determine signal based on after-hours activity
            let signal = 'HOLD';
            const ahChangePercent = stock.afterHoursChangePercent || 0;
            const ahVolume = stock.afterHoursVolume || 0;
            
            if (ahVolume > 100000) {
                if (ahChangePercent > 2) signal = 'BUY';
                else if (ahChangePercent < -2) signal = 'SELL';
                else if (ahChangePercent > 1) signal = 'WATCH_BUY';
                else if (ahChangePercent < -1) signal = 'WATCH_SELL';
            }
            
            // Determine momentum
            let momentum = 'neutral';
            if (ahChangePercent > 0.5) momentum = 'bullish';
            else if (ahChangePercent < -0.5) momentum = 'bearish';
            
            return {
                rank: index + 1,
                symbol: stock.symbol,
                // After-hours data
                afterHoursPrice: stock.afterHoursPrice,
                afterHoursChange: stock.afterHoursChange,
                afterHoursChangePercent: ahChangePercent,
                afterHoursVolume: ahVolume,
                afterHoursHigh: stock.afterHoursHigh,
                afterHoursLow: stock.afterHoursLow,
                // Regular hours data
                regularClose: stock.regularClose,
                dayChange: stock.dayChange,
                dayChangePercent: stock.dayChangePercent,
                regularVolume: stock.regularVolume,
                // Analysis
                momentum: momentum,
                signal: signal,
                volumeSurge: ahVolume > 500000,
                unusualActivity: Math.abs(ahChangePercent) > 3,
                updateTime: new Date().toLocaleTimeString('en-US')
            };
        });
        
        res.json({ 
            success: true, 
            stocks: formattedStocks,
            marketStatus: getMarketStatus(),
            updateTime: new Date().toLocaleTimeString('en-US')
        });
        
    } catch (error) {
        console.error('Error in /api/afterhours/top-movers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get market status
function getMarketStatus() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const time = hour * 100 + minute;
    const day = now.getDay();
    
    // Skip weekends
    if (day === 0 || day === 6) {
        return { 
            status: 'closed', 
            message: 'Market closed - Weekend',
            nextOpen: 'Monday 9:30 AM ET'
        };
    }
    
    let status = 'closed';
    let message = '';
    
    if (time >= 400 && time < 930) {
        status = 'pre-market';
        message = 'Pre-market trading';
    } else if (time >= 930 && time < 1600) {
        status = 'open';
        message = 'Regular trading hours';
    } else if (time >= 1600 && time < 2000) {
        status = 'after-hours';
        message = 'After-hours trading';
    } else {
        status = 'closed';
        message = 'Market closed';
    }
    
    return { status, message, currentTime: now.toLocaleTimeString('en-US') };
}

app.get('/api/market/status', (req, res) => {
    res.json({ success: true, data: getMarketStatus() });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        marketStatus: getMarketStatus()
    });
});

// Start HTTP server
const PORT = 3013;
app.listen(PORT, () => {
    console.log(`🌙 After-Hours Server running on http://localhost:${PORT}`);
    console.log('📊 Serving after-hours trading data from Polygon.io');
    console.log('🔄 Updates every 30 seconds during after-hours (4:00 PM - 8:00 PM ET)');
    
    // Pre-fetch data on startup
    fetchAfterHoursStocks();
});

// WebSocket server for real-time updates
const WS_PORT = 3007;
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
    console.log('📡 WebSocket client connected for after-hours data');
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'subscribe' && data.payload?.symbols) {
                // Send updates every 30 seconds
                const interval = setInterval(async () => {
                    const stocks = await fetchAfterHoursStocks();
                    const symbol = data.payload.symbols[0];
                    const stockData = stocks.find(s => s.symbol === symbol);
                    
                    if (stockData) {
                        ws.send(JSON.stringify({
                            type: 'afterHoursUpdate',
                            data: {
                                symbol: stockData.symbol,
                                afterHoursPrice: stockData.afterHoursPrice,
                                afterHoursChange: stockData.afterHoursChange,
                                afterHoursChangePercent: stockData.afterHoursChangePercent,
                                afterHoursVolume: stockData.afterHoursVolume,
                                regularClose: stockData.regularClose
                            },
                            timestamp: new Date().toISOString()
                        }));
                    }
                }, 30000);
                
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

console.log(`📡 WebSocket server for after-hours running on ws://localhost:${WS_PORT}`);