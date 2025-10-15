console.log(`========================================`);
console.log(`🚀 STARTING UNIFIED SCANNER`);
console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
console.log(`========================================`);

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3050;
const WS_PORT = process.env.WS_PORT || 3051;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';

// Cache for data
let topGainersCache = [];
let risingStocksCache = [];
let spikeDetectorCache = [];
let volumeMoversCache = [];
let whaleOrdersCache = [];
let volumeHistory = new Map(); // Store volume history for timeframe analysis
let priceHistory = new Map(); // Store price history for timeframe analysis
let tradeHistory = new Map(); // Store recent trades for whale detection
let volumeRateHistory = new Map(); // Store volume rate (volume/minute) calculations
let lastVolumeSnapshot = new Map(); // Store last known volume for each symbol
let haltedStocks = new Set(); // Track halted/suspended stocks
let daily3Cache = []; // Cache for Daily3 dip pattern stocks
let daily3LastUpdate = null; // Track when Daily3 data was last updated

// Track session start volumes for session-specific volume calculation
let sessionStartVolumes = new Map(); // Symbol -> volume at session start
let currentMarketSession = null;
let lastSessionCheckTime = null;
let lastUpdate = Date.now();

// Cache for recently checked halt statuses (to avoid too many API calls)
const haltStatusCache = new Map(); // symbol -> {status, timestamp}
const HALT_CACHE_TTL = 30000; // Cache for 30 seconds

// Volume tracking timeframes (in seconds)
const VOLUME_TIMEFRAMES = {
    '30s': 30,
    '1m': 60,
    '2m': 120,
    '3m': 180,
    '5m': 300
};

// Check if a stock is halted via Polygon quote data
async function checkHaltStatus(symbol, stockData) {
    try {
        // Check cache first
        const cached = haltStatusCache.get(symbol);
        if (cached && (Date.now() - cached.timestamp < HALT_CACHE_TTL)) {
            return cached.status;
        }

        // Analyze the stock data we already have
        const session = getMarketSession();
        const dayChange = stockData.validatedDayChange || 0;
        const volume = stockData.day?.v || 0;
        const high = stockData.day?.h || 0;
        const low = stockData.day?.l || 0;
        const close = stockData.day?.c || 0;
        const updated = stockData.updated || stockData.day?.t || 0;
        const timeSinceUpdate = Date.now() - updated;

        let status = 'ACTIVE';

        // During market hours, check for halt patterns
        if (session === 'Regular Hours') {
            // No volume and extreme price change = likely halted
            if (volume === 0 && Math.abs(dayChange) > 50) {
                status = 'HALTED';
            }
            // All prices the same with volume = T1/T2 halt
            else if (high === low && high === close && volume > 0) {
                status = 'HALTED';
            }
            // No updates for 15+ minutes during regular hours
            else if (timeSinceUpdate > 15 * 60 * 1000 && Math.abs(dayChange) > 20) {
                status = 'HALTED';
            }
        }

        // Cache the result
        haltStatusCache.set(symbol, { status, timestamp: Date.now() });
        return status;

    } catch (error) {
        return 'ACTIVE'; // Default to active if we can't determine
    }
}

// Get current market session
function getMarketSession() {
    const now = new Date();
    // Convert to ET (Eastern Time)
    const etOffset = -5; // EST offset (use -4 for EDT)
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const et = new Date(utc + (3600000 * etOffset));

    const hours = et.getHours();
    const minutes = et.getMinutes();
    const time = hours * 100 + minutes;

    // Market hours in ET
    if (time >= 400 && time < 930) {
        return 'Pre-Market';
    } else if (time >= 930 && time < 1600) {
        return 'Regular Hours';
    } else if (time >= 1600 && time < 2000) {
        return 'After Hours';
    } else {
        return 'Closed';
    }
}

// Update session volumes when market session changes
function updateSessionVolumes(stocks) {
    const newSession = getMarketSession();

    // Check if session has changed
    if (currentMarketSession !== newSession) {
        console.log(`📊 Market session changed: ${currentMarketSession} → ${newSession}`);

        // Clear session volumes at start of new session
        sessionStartVolumes.clear();

        // Store current volumes as session start volumes
        stocks.forEach(stock => {
            const totalVolume = stock.day?.v || stock.totalVolume || stock.volume || 0;
            sessionStartVolumes.set(stock.symbol, totalVolume);
        });

        currentMarketSession = newSession;
        console.log(`📊 Stored session start volumes for ${sessionStartVolumes.size} stocks`);
    }

    // Calculate session-specific volumes
    return stocks.map(stock => {
        const totalVolume = stock.day?.v || stock.totalVolume || stock.volume || 0;
        const sessionStartVol = sessionStartVolumes.get(stock.symbol) || 0;
        const sessionVolume = totalVolume - sessionStartVol;

        // Use session volume if available, otherwise use total volume
        return {
            ...stock,
            sessionVolume: sessionVolume > 0 ? sessionVolume : totalVolume,
            volume: sessionVolume > 0 ? sessionVolume : totalVolume, // Override volume with session-specific
            totalVolume: totalVolume // Keep total volume separately
        };
    });
}
let rankingHistory = new Map();
let volumeRankingHistory = new Map();
const POSITION_TRACKING_WINDOW = 5 * 60 * 1000;

// Cache for market halt status
let marketHaltedTickers = new Set();
let lastMarketStatusCheck = 0;
const MARKET_STATUS_CHECK_INTERVAL = 30000; // Check every 30 seconds

// Check market-wide halt status
async function checkMarketHaltStatus() {
    try {
        const now = Date.now();
        if (now - lastMarketStatusCheck < MARKET_STATUS_CHECK_INTERVAL) {
            return marketHaltedTickers;
        }

        const url = `https://api.polygon.io/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url, { timeout: 3000 });

        // Check if there's a halted securities list
        if (response.data.securities && response.data.securities.halted) {
            marketHaltedTickers = new Set(response.data.securities.halted);
            console.log(`📍 Market Status: ${marketHaltedTickers.size} stocks halted`);
        } else {
            marketHaltedTickers.clear();
        }

        lastMarketStatusCheck = now;
        return marketHaltedTickers;
    } catch (error) {
        console.error('Error checking market halt status:', error.message);
        return marketHaltedTickers;
    }
}

// Check official halt status from Polygon API using multiple sources
async function checkOfficialHaltStatus(symbol) {
    // Check cache first
    const cached = haltStatusCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < HALT_CACHE_TTL) {
        return cached.status;
    }

    try {
        let status = 'ACTIVE';

        // 1. First check market-wide halt list
        const haltedList = await checkMarketHaltStatus();
        if (haltedList.has(symbol)) {
            status = 'HALTED';
            haltStatusCache.set(symbol, { status, timestamp: Date.now() });
            return status;
        }

        // 2. Check ticker details for active status
        try {
            const tickerUrl = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
            const tickerResponse = await axios.get(tickerUrl, { timeout: 3000 });

            if (tickerResponse.data.results) {
                const ticker = tickerResponse.data.results;

                // Check if stock is inactive (delisted/suspended)
                if (ticker.active === false) {
                    status = 'SUSPENDED';
                    console.log(`⚠️ ${symbol} marked as inactive in ticker details`);
                    haltStatusCache.set(symbol, { status, timestamp: Date.now() });
                    return status;
                }

                // Check for delisted date
                if (ticker.delisted_utc) {
                    status = 'DELISTED';
                    console.log(`❌ ${symbol} is delisted as of ${ticker.delisted_utc}`);
                    haltStatusCache.set(symbol, { status, timestamp: Date.now() });
                    return status;
                }
            }
        } catch (tickerError) {
            // If ticker details fail, continue with other checks
            console.error(`Ticker details error for ${symbol}:`, tickerError.message);
        }

        // 3. Check recent trading activity as a fallback
        const marketSession = getMarketSession();

        // Only check trading activity during market hours
        if (marketSession === 'Regular Hours' || marketSession === 'Pre-Market') {
            const tradesUrl = `https://api.polygon.io/v3/trades/${symbol}?order=desc&limit=1&apiKey=${POLYGON_API_KEY}`;
            const tradesResponse = await axios.get(tradesUrl, { timeout: 3000 });

            if (tradesResponse.data.results && tradesResponse.data.results.length > 0) {
                const lastTrade = tradesResponse.data.results[0];
                const tradeTime = lastTrade.participant_timestamp / 1000000; // nanoseconds to ms
                const minutesSinceLastTrade = (Date.now() - tradeTime) / 60000;

                // If no trades for extended period during regular hours, might be halted
                if (minutesSinceLastTrade > 15 && marketSession === 'Regular Hours') {
                    // Check volume to see if it's a real halt
                    const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
                    const snapshotResponse = await axios.get(snapshotUrl, { timeout: 3000 });

                    if (snapshotResponse.data.ticker) {
                        const dayVolume = snapshotResponse.data.ticker.day?.v || 0;

                        // If there's volume but no recent trades, likely halted
                        if (dayVolume > 0 && minutesSinceLastTrade > 15) {
                            status = 'HALTED';
                            console.log(`🛑 ${symbol} likely halted - no trades for ${minutesSinceLastTrade.toFixed(0)} minutes`);
                        }
                    }
                }
            }
        }

        // Cache the result
        haltStatusCache.set(symbol, { status, timestamp: Date.now() });
        return status;

    } catch (error) {
        console.error(`Error checking halt status for ${symbol}:`, error.message);
        return 'ACTIVE';
    }
}

// WebSocket server for real-time updates
console.log(`🔄 Attempting to create WebSocket server on port ${WS_PORT}...`);
let wss;
let clients = new Set();

try {
    wss = new WebSocket.Server({ port: WS_PORT }, () => {
        console.log(`✅ WebSocket server listening on port ${WS_PORT}`);
    });
    console.log(`🔄 WebSocket.Server created, waiting for listen callback...`);

    // Add error handler for WebSocket server
    wss.on('error', (error) => {
        console.error(`❌ WebSocket server error:`, error.message);
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${WS_PORT} is already in use. Please free the port or change WS_PORT environment variable.`);
        }
    });
} catch (error) {
    console.error(`❌ Failed to create WebSocket server:`, error.message);
    console.error(`❌ Error details:`, error);
    // Create a dummy wss object so the rest of the code doesn't break
    wss = {
        on: () => {},
        clients: new Set()
    };
}

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`👤 Client connected. Total: ${clients.size}`);

    // Send initial data
    ws.send(JSON.stringify({
        type: 'gainers',
        data: topGainersCache,
        timestamp: lastUpdate,
        marketSession: getMarketSession()
    }));

    // Handle messages from client
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'getWhales') {
                // Get whale orders with filters
                const whales = await getWhaleOrders();
                ws.send(JSON.stringify({
                    type: 'whales',
                    whales: whales
                }));
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`👤 Client disconnected. Total: ${clients.size}`);
    });
});

// Broadcast to all WebSocket clients
function broadcast(data) {
    const message = JSON.stringify(data);
    let sentCount = 0;
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
            sentCount++;
        }
    });
    if (sentCount > 0 && data.type === 'volumeMovers') {
        console.log(`📡 Broadcasted volumeMovers to ${sentCount} clients`);
    }
}

// Get top gainers
async function getTopGainers() {
    try {
        // Fetch ALL tickers to get more gainers
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            // Filter for gainers with positive day change
            let gainers = response.data.tickers.filter(t => {
                // Get the most recent price and market session
                const marketSession = getMarketSession();
                let currentPrice, regularClosePrice;
                let dayChange = 0;
                let sessionChange = 0;
                let afterHoursChange = 0;

                // Get prices based on market session
                const prevClose = t.prevDay?.c || 0;
                const regularClose = t.day?.c || 0;
                const latestPrice = t.min?.c || t.day?.c || 0;

                // Calculate dayChange from actual prices instead of trusting API value
                // The API's todaysChangePerc is sometimes incorrect
                if (prevClose > 0 && latestPrice > 0) {
                    // Calculate the actual change from previous close to latest price
                    dayChange = ((latestPrice - prevClose) / prevClose) * 100;
                } else if (prevClose > 0 && regularClose > 0) {
                    // Fall back to regular close if no latest price
                    dayChange = ((regularClose - prevClose) / prevClose) * 100;
                } else {
                    // Only use API value as last resort
                    dayChange = t.todaysChangePerc || 0;
                }

                if (marketSession === 'After Hours') {
                    // After market hours (4:00 PM - 8:00 PM ET)
                    currentPrice = t.min?.c || t.day?.c || 0;  // Latest extended hours price

                    // After-hours change: from regular close to current after-hours price
                    if (regularClose > 0 && currentPrice > 0 && t.min?.c) {
                        afterHoursChange = ((currentPrice - regularClose) / regularClose) * 100;
                        sessionChange = afterHoursChange;
                    } else {
                        sessionChange = 0;
                    }

                } else if (marketSession === 'Pre-Market') {
                    // Pre-market hours (4:00 AM - 9:30 AM ET)
                    currentPrice = t.min?.c || prevClose || 0;  // Current pre-market price

                    // Pre-market change: from yesterday's close to current pre-market price
                    if (currentPrice > 0 && prevClose > 0 && t.min?.c) {
                        sessionChange = ((currentPrice - prevClose) / prevClose) * 100;
                    } else {
                        sessionChange = 0;
                    }

                } else if (marketSession === 'Closed') {
                    // Market closed (8:00 PM - 4:00 AM ET)
                    // Show the last available price and any after-hours movement from today
                    currentPrice = t.day?.c || t.min?.c || prevClose || 0;

                    // If there was after-hours trading today, calculate it
                    if (regularClose > 0 && t.min?.c && t.min.c !== regularClose) {
                        afterHoursChange = ((t.min.c - regularClose) / regularClose) * 100;
                        sessionChange = 0; // No active session
                    } else {
                        sessionChange = 0;
                        afterHoursChange = 0;
                    }

                } else {
                    // Regular trading hours (9:30 AM - 4:00 PM ET)
                    // Use the most recent available price
                    currentPrice = t.min?.c || t.day?.c || 0;

                    // Use our calculated dayChange (from above) which is more accurate
                    sessionChange = dayChange;

                    // Log if there's a big discrepancy with API for debugging
                    if (t.todaysChangePerc !== undefined && t.todaysChangePerc !== null) {
                        const apiChange = t.todaysChangePerc;
                        if (Math.abs(dayChange - apiChange) > 10) {
                            console.log(`📊 ${t.ticker}: Calculated=${dayChange.toFixed(2)}%, API=${apiChange.toFixed(2)}%, Price=${currentPrice}, PrevClose=${prevClose}`);
                            console.log(`   Using calculated value: ${dayChange.toFixed(2)}%`);
                        }
                    }
                }

                // Special handling for known problematic stocks
                if (t.ticker === 'MHY') {
                    console.log(`⚠️ Filtering out MHY - known bad data from API`);
                    return false;
                }

                // Store all calculated values
                t.currentPrice = currentPrice;
                t.validatedDayChange = dayChange;
                t.sessionChange = sessionChange;
                t.afterHoursChange = afterHoursChange;

                const volume = t.day?.v || t.min?.av || t.prevDay?.v || 0;
                const price = currentPrice || t.prevDay?.c || 0;

                // Include stocks with positive day change OR positive session change
                return (dayChange > 0 || sessionChange > 0) && volume > 500000 && price > 0;
            })
            .sort((a, b) => (b.validatedDayChange || 0) - (a.validatedDayChange || 0))
            .slice(0, 200); // Get top 200 gainers

            // Update ranking history
            const cutoff = Date.now() - POSITION_TRACKING_WINDOW;
            gainers.forEach((stock, index) => {
                const symbol = stock.ticker;
                if (!rankingHistory.has(symbol)) {
                    rankingHistory.set(symbol, []);
                }
                const history = rankingHistory.get(symbol);
                history.push({ timestamp: Date.now(), rank: index + 1 });

                // Clean old entries
                const filtered = history.filter(entry => entry.timestamp > cutoff);
                rankingHistory.set(symbol, filtered);
            });

            // Calculate position changes
            gainers = await Promise.all(gainers.map(async (stock, index) => {
                const currentRank = index + 1;
                const history = rankingHistory.get(stock.ticker) || [];

                let positionChange = 0;
                if (history.length > 1) {
                    const oldestEntry = history[0];
                    positionChange = oldestEntry.rank - currentRank;
                }

                // Get appropriate price based on market session
                const marketSession = getMarketSession();
                let displayPrice;

                if (marketSession === 'Closed') {
                    // When market is closed, use today's close if available
                    displayPrice = stock.day?.c || stock.prevDay?.c || stock.min?.c || 0;
                } else if (marketSession === 'After Hours' || marketSession === 'Pre-Market') {
                    // During extended hours, prefer latest quote
                    displayPrice = stock.min?.c || stock.day?.c || stock.prevDay?.c || 0;
                } else {
                    // Regular hours - prefer latest quote for real-time updates
                    displayPrice = stock.min?.c || stock.day?.c || stock.prevDay?.c || 0;
                }

                // Get total daily volume - more reliable than trying to split sessions
                const totalVolume = stock.day?.v || stock.prevDay?.v || 0;
                const session = getMarketSession();

                // Detect trading status (halted/suspended)
                let tradingStatus = 'ACTIVE';

                // DISABLED - Causing too many API calls and timeouts
                // const haltStatus = await checkOfficialHaltStatus(stock.ticker);
                // if (haltStatus !== 'ACTIVE') {
                //     tradingStatus = haltStatus;
                //     console.log(`📍 ${stock.ticker} Official Status: ${haltStatus}`);
                // }

                // DISABLE ALL HALT DETECTION - causing false positives
                // Everything will show as ACTIVE for now
                tradingStatus = 'ACTIVE';

                // DISABLED PATTERN DETECTION
                if (false) {
                    // Get latest quote timestamp and price info
                    const lastQuoteTime = stock.min?.t || stock.day?.t || stock.updated || 0;
                    const timeSinceLastQuote = Date.now() - lastQuoteTime;
                    const lastPrice = stock.min?.c || stock.day?.c || 0;
                    const prevPrice = stock.prevDay?.c || 0;

                    // Check for specific halt/suspension patterns
                    if (session !== 'Closed') {
                        // Check for T1/T2 halt (all prices identical)
                        if (stock.day?.h === stock.day?.l && stock.day?.h === stock.day?.c && totalVolume > 0) {
                            // All prices identical = definitely halted
                            tradingStatus = 'HALTED';
                            console.log(`⛔ ${stock.ticker} T12 HALT: All prices identical at $${stock.day.h}`);
                        }
                        // For extreme movers, check volume patterns more carefully
                        else if (Math.abs(stock.validatedDayChange) > 100) {
                            // For extreme moves, check if volume has been static
                            const volHistory = volumeHistory.get(stock.ticker) || [];

                            // Need at least 3 data points
                            if (volHistory.length >= 3) {
                                const recent3 = volHistory.slice(-3);
                                const volumeStatic = recent3.every(v => v.volume === totalVolume);

                                // If volume hasn't changed in 3 updates, likely halted
                                if (volumeStatic && totalVolume > 0) {
                                    tradingStatus = 'HALTED';
                                    console.log(`⚠️ ${stock.ticker} likely HALTED: ${stock.validatedDayChange.toFixed(1)}% move with static volume`);
                                }
                            }
                        }
                        // Check for zero volume (common suspension indicator)
                        else if (totalVolume === 0) {
                            if (session === 'Regular Hours') {
                                tradingStatus = 'SUSPENDED';
                            } else if (stock.prevDay?.v > 100000) {
                                // Had volume yesterday but none today
                                tradingStatus = 'SUSPENDED';
                            }
                        }
                        // Check for T12 halt pattern (all prices the same)
                        else if (stock.day?.h && stock.day?.l && stock.day?.c) {
                            if (stock.day.h === stock.day.l && stock.day.h === stock.day.c && totalVolume > 0) {
                                tradingStatus = 'HALTED';
                            }
                        }
                        // Check for significant day change with no recent activity
                        else if (Math.abs(stock.validatedDayChange) > 10) {
                            const prcHistory = priceHistory.get(stock.ticker) || [];
                            const volHistory = volumeHistory.get(stock.ticker) || [];

                            // Need at least 3 data points to determine
                            if (prcHistory.length >= 3 && volHistory.length >= 3) {
                                const recent3Price = prcHistory.slice(-3);
                                const recent3Vol = volHistory.slice(-3);

                                // Check if price and volume are frozen
                                const pricesFrozen = recent3Price.every(p =>
                                    Math.abs(p.price - lastPrice) < 0.01
                                );
                                const volumeFrozen = recent3Vol.every(v =>
                                    v.volume === totalVolume
                                );

                                if (pricesFrozen && volumeFrozen) {
                                    tradingStatus = 'HALTED';
                                    haltedStocks.add(stock.ticker); // Add to cache
                                }
                            }
                        }
                        // Check for extended hours halt (no trades for 20+ minutes)
                        else if (session === 'Pre-Market' || session === 'After Hours') {
                            if (timeSinceLastQuote > 20 * 60 * 1000 && totalVolume > 0) {
                                tradingStatus = 'HALTED';
                            }
                        }
                        // Regular hours - no updates for 5+ minutes is suspicious
                        else if (session === 'Regular Hours' && timeSinceLastQuote > 5 * 60 * 1000) {
                            tradingStatus = 'HALTED';
                            haltedStocks.add(stock.ticker); // Add to cache
                        }
                    }
                }

                return {
                    symbol: stock.ticker,
                    price: displayPrice,
                    dayChange: stock.validatedDayChange || stock.todaysChangePerc || 0,
                    sessionChange: stock.sessionChange || 0,
                    afterHoursChange: stock.afterHoursChange || 0,
                    volume: totalVolume,
                    volumeLabel: session + ' Volume',
                    totalVolume: totalVolume,
                    dollarVolume: ((stock.day?.c || 0) * (stock.day?.v || 0)).toFixed(0),
                    high: stock.day?.h || stock.prevDay?.h || 0,
                    low: stock.day?.l || stock.prevDay?.l || 0,
                    positionChange,
                    currentRank,
                    marketSession: session,
                    tradingStatus: tradingStatus
                };
            }));

            // Apply session-specific volume calculations
            gainers = updateSessionVolumes(gainers);

            topGainersCache = gainers;
            lastUpdate = Date.now();

            // Debug log first few stocks' totalVolume values
            if (gainers.length > 0) {
                console.log(`🔄 API Update - First 3 stocks totalVolume:`);
                gainers.slice(0, 3).forEach(stock => {
                    console.log(`  ${stock.symbol}: totalVol=${stock.totalVolume}, sessionVol=${stock.volume}`);
                });
            }

            // Broadcast to WebSocket clients
            broadcast({
                type: 'gainers',
                data: gainers,
                timestamp: lastUpdate,
                marketSession: getMarketSession()
            });

            return gainers;
        }
    } catch (error) {
        console.error('Error fetching gainers:', error.message);
    }
    return topGainersCache;
}

// Get rising stocks (simple scanner)
async function getRisingStocks() {
    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            const risingStocks = response.data.tickers
                .filter(t => {
                    // Calculate actual change percentage from prices - don't trust API value
                    const currentPrice = t.day?.c || t.min?.c || 0;
                    const prevClose = t.prevDay?.c || 0;
                    let dayChange = 0;

                    // Always calculate change from actual prices
                    if (currentPrice > 0 && prevClose > 0) {
                        dayChange = ((currentPrice - prevClose) / prevClose) * 100;
                    } else {
                        // Only use API value if we can't calculate
                        dayChange = t.todaysChangePerc || 0;
                    }

                    const volume = t.day?.v || t.min?.av || t.prevDay?.v || 0;
                    const price = currentPrice || prevClose || 0;

                    return dayChange >= 1.2 &&
                           volume >= 500000 &&
                           price > 0 &&
                           price <= 500;
                })
                .map(t => {
                    // Re-calculate for the map as well
                    const currentPrice = t.day?.c || t.min?.c || 0;
                    const prevClose = t.prevDay?.c || 0;
                    let dayChange = t.todaysChangePerc || 0;

                    if (currentPrice > 0 && prevClose > 0) {
                        const calculatedChange = ((currentPrice - prevClose) / prevClose) * 100;
                        if (Math.abs(dayChange - calculatedChange) > 50) {
                            dayChange = calculatedChange;
                        }
                    }

                    return {
                        symbol: t.ticker,
                        price: currentPrice || prevClose || 0,
                        dayChange: dayChange,
                        volume: t.day?.v || t.min?.av || t.prevDay?.v || 0,
                        dollarVolume: ((currentPrice || 0) * (t.day?.v || 0)).toFixed(0),
                        high: t.day?.h || t.prevDay?.h || 0,
                        low: t.day?.l || t.prevDay?.l || 0
                    };
                })
                .sort((a, b) => b.dayChange - a.dayChange);

            risingStocksCache = risingStocks;
            return risingStocks;
        }
    } catch (error) {
        console.error('Error fetching rising stocks:', error.message);
    }
    return risingStocksCache;
}

// ============================================
// DAILY3 DIP PATTERN DETECTION
// ============================================

// Helper function to get last 5 trading days
function getLastFiveTradingDays() {
    const days = [];
    let daysAdded = 0;

    // Start from yesterday (not today, since today's data may not be complete)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1); // Start from yesterday

    let currentDay = new Date(startDate);

    // Go back up to 14 calendar days to find 5 trading days
    for (let i = 0; i < 14 && daysAdded < 5; i++) {
        const dayOfWeek = currentDay.getDay();

        // Skip weekends (0 = Sunday, 6 = Saturday)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            days.push(new Date(currentDay));
            daysAdded++;
        }

        // Move to previous day
        currentDay.setDate(currentDay.getDate() - 1);
    }

    return days;
}

// Analyze dip pattern for a single day
async function analyzeDipForDay(symbol, date, minDipPercent) {
    try {
        const dateStr = date.toISOString().split('T')[0];

        // Get 1-minute aggregates for the trading day (9:30 AM - 11:00 AM ET)
        // We need data from 9:30 to 10:00 AM ET to analyze the dip window
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${dateStr}/${dateStr}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;

        const response = await axios.get(url, { timeout: 10000 });

        if (!response.data || !response.data.results || response.data.results.length === 0) {
            return null;
        }

        const bars = response.data.results;

        // Convert timestamps to ET and filter for 9:30-10:30 AM ET window
        const etBars = bars.map(bar => {
            const barTime = new Date(bar.t);
            // Convert to ET (adjust based on DST, using -5 hours for EST)
            const etOffset = -5 * 60 * 60 * 1000;
            const etTime = new Date(barTime.getTime() + etOffset);
            return {
                ...bar,
                etTime: etTime,
                etHour: etTime.getHours(),
                etMinute: etTime.getMinutes()
            };
        });

        // Find 9:30 AM bar (market open)
        const openBar = etBars.find(b => b.etHour === 9 && b.etMinute === 30);
        if (!openBar) return null;

        const openPrice = openBar.c;

        // Find all bars between 9:35 and 10:00 AM ET
        const dipWindowBars = etBars.filter(b =>
            (b.etHour === 9 && b.etMinute >= 35) ||
            (b.etHour === 10 && b.etMinute === 0)
        );

        if (dipWindowBars.length === 0) return null;

        // Find the lowest price in the 9:35-10:00 window
        const lowestBar = dipWindowBars.reduce((min, bar) =>
            bar.l < min.l ? bar : min
        , dipWindowBars[0]);

        const lowestPrice = lowestBar.l;
        const dipPercent = ((lowestPrice - openPrice) / openPrice) * 100;
        const dipTime = new Date(lowestBar.etTime).toTimeString().slice(0, 5);

        // Only return if it meets the minimum dip threshold (negative %)
        if (dipPercent <= -minDipPercent) {
            return {
                date: dateStr,
                dipPercent: parseFloat(dipPercent.toFixed(2)),
                dipTime: dipTime,
                openPrice: openPrice,
                lowestPrice: lowestPrice
            };
        }

        return null;
    } catch (error) {
        // Silently handle errors for individual stocks/days
        if (!error.message.includes('timeout') && !error.message.includes('404')) {
            console.error(`Error analyzing ${symbol} on ${date.toISOString().split('T')[0]}:`, error.message);
        }
        return null;
    }
}

// Get news for a stock
async function getStockNews(symbol) {
    try {
        const newsUrl = `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(newsUrl, { timeout: 5000 });

        if (response.data && response.data.results) {
            const now = Date.now();
            const recentNews = response.data.results.filter(item => {
                // Only news from last 48 hours
                const newsAge = now - new Date(item.published_utc).getTime();
                return newsAge < 48 * 60 * 60 * 1000;
            });

            return {
                hasNews: recentNews.length > 0,
                count: recentNews.length,
                headlines: recentNews.map(item => ({
                    title: item.title,
                    published: item.published_utc,
                    source: item.publisher?.name || 'Unknown',
                    url: item.article_url
                }))
            };
        }
    } catch (error) {
        // Silently handle news errors
    }

    return { hasNews: false, count: 0, headlines: [] };
}

// Main function to get Daily3 dip pattern stocks
async function getDaily3DipPatterns(minPrice, maxPrice, minDipPercent) {
    console.log(`🔍 Daily3: Analyzing dip patterns (Price: $${minPrice}-$${maxPrice}, Min Dip: ${minDipPercent}%)`);

    try {
        const lastFiveDays = getLastFiveTradingDays();
        console.log(`📅 Analyzing last 5 trading days: ${lastFiveDays.map(d => d.toISOString().split('T')[0]).join(', ')}`);

        // Get initial stock list from current top gainers/volume movers
        // We'll analyze stocks that are currently active
        const stocksToAnalyze = [...new Set([
            ...topGainersCache.slice(0, 100).map(s => s.symbol),
            ...volumeMoversCache.slice(0, 100).map(s => s.symbol)
        ])];

        console.log(`📊 Analyzing ${stocksToAnalyze.length} stocks for dip patterns...`);

        const results = [];

        for (const symbol of stocksToAnalyze) {
            try {
                // Get current price (from cache)
                const stockData = topGainersCache.find(s => s.symbol === symbol) ||
                                volumeMoversCache.find(s => s.symbol === symbol);

                if (!stockData) continue;

                const currentPrice = stockData.price;

                // Skip if price doesn't meet criteria
                if (currentPrice < minPrice || currentPrice > maxPrice) continue;

                // Analyze dip pattern for each of the last 5 trading days
                const dipAnalysis = await Promise.all(
                    lastFiveDays.map(day => analyzeDipForDay(symbol, day, minDipPercent))
                );

                // Filter out null results (days without dips)
                const validDips = dipAnalysis.filter(d => d !== null);

                // Check if stock meets the criteria (3+ days with dip pattern)
                if (validDips.length >= 3) {
                    // Calculate average dip percentage
                    const avgDipPercent = validDips.reduce((sum, d) => sum + d.dipPercent, 0) / validDips.length;

                    // Get news for this stock
                    const news = await getStockNews(symbol);

                    results.push({
                        symbol: symbol,
                        name: stockData.symbol, // We don't have company name in cache, use symbol
                        currentPrice: currentPrice,
                        dipPattern: {
                            successDays: validDips.length,
                            totalDays: 5,
                            avgDipPercent: parseFloat(avgDipPercent.toFixed(2)),
                            lastFiveDays: dipAnalysis.map((dip, idx) => ({
                                date: lastFiveDays[idx].toISOString().split('T')[0],
                                ...dip
                            }))
                        },
                        news: news
                    });

                    console.log(`✅ ${symbol}: ${validDips.length}/5 days with dip pattern (avg: ${avgDipPercent.toFixed(2)}%)`);
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 150));

            } catch (error) {
                console.error(`Error analyzing ${symbol}:`, error.message);
            }
        }

        console.log(`✅ Daily3: Found ${results.length} stocks with consistent dip patterns`);
        return results.sort((a, b) => b.dipPattern.successDays - a.dipPattern.successDays);

    } catch (error) {
        console.error('❌ Error in getDaily3DipPatterns:', error);
        return [];
    }
}

// Get volume movers with multiple timeframe analysis
async function getVolumeMovers() {
    try {
        // Use the same data as Top Gainers to ensure consistency
        const now = Date.now();

        // IMPORTANT: This function updates priceHistory and volumeHistory with FRESH API data.
        // trackHistoricalData() only READS this history for broadcasting - it does NOT update it.
        // This ensures we don't store stale cached data causing 0% changes.

        // Add volume and price change calculations to each stock from topGainersCache
        let movers = topGainersCache.map((stock, index) => {
            const symbol = stock.symbol;
            // IMPORTANT: Always use totalVolume for tracking changes
            // stock.volume is session-specific and will reset, causing 0% changes
            const currentVolume = stock.totalVolume || 0;
            const currentPrice = stock.price;

            // Initialize history if needed
            if (!volumeHistory.has(symbol)) {
                volumeHistory.set(symbol, []);
            }
            if (!priceHistory.has(symbol)) {
                priceHistory.set(symbol, []);
            }

            const volHistory = volumeHistory.get(symbol);
            const prcHistory = priceHistory.get(symbol);

            // Update history with FRESH API data
            volHistory.push({ time: now, volume: currentVolume });
            prcHistory.push({ time: now, price: currentPrice });

            // Keep only last 5 minutes of data
            const fiveMinutesAgo = now - 300000;
            while (volHistory.length > 0 && volHistory[0].time < fiveMinutesAgo) {
                volHistory.shift();
            }
            while (prcHistory.length > 0 && prcHistory[0].time < fiveMinutesAgo) {
                prcHistory.shift();
            }

            // Calculate volume and price changes for each timeframe
            const volumeChanges = {};
            const priceChanges = {};

            for (const [label, seconds] of Object.entries(VOLUME_TIMEFRAMES)) {
                const targetTime = now - (seconds * 1000);
                // Increase tolerance to 10 seconds for better data matching
                const oldVolEntry = volHistory.find(h => Math.abs(h.time - targetTime) < 10000); // 10s tolerance
                const oldPrcEntry = prcHistory.find(h => Math.abs(h.time - targetTime) < 10000);

                if (oldVolEntry && oldVolEntry.volume > 0 && currentVolume > 0) {
                    const change = ((currentVolume - oldVolEntry.volume) / oldVolEntry.volume) * 100;
                    volumeChanges[label] = change;
                    // Debug log significant volume changes
                    if (label === '30s' && Math.abs(change) > 0.1 && index < 5) {
                        console.log(`📈 ${stock.symbol} 30s vol change: ${change.toFixed(2)}% (${oldVolEntry.volume} → ${currentVolume})`);
                    }
                } else {
                    volumeChanges[label] = 0;
                }

                if (oldPrcEntry && oldPrcEntry.price > 0) {
                    const change = ((currentPrice - oldPrcEntry.price) / oldPrcEntry.price) * 100;
                    priceChanges[label] = change;
                } else {
                    priceChanges[label] = 0;
                }
            }

            // Calculate average volume rate (volume per minute)
            const avgVolumeRate = volHistory.length > 1 ?
                (currentVolume - volHistory[0].volume) / ((now - volHistory[0].time) / 60000) : 0;

            // Calculate Buy Pressure Indicator using shared function
            // Use totalVolume, not session volume for buy pressure calculation
            const buyPressure = calculateBuyPressure(priceChanges, volumeChanges, stock.dayChange, stock.totalVolume || 0);

            return {
                symbol: stock.symbol,
                price: stock.price,
                dayChange: stock.dayChange,
                volume: stock.volume,
                volumeLabel: stock.volumeLabel,
                totalVolume: stock.totalVolume,
                volumeChanges: volumeChanges,
                priceChanges: priceChanges,
                avgVolumeRate: avgVolumeRate,
                buyPressure: buyPressure,
                high: stock.high,
                low: stock.low,
                positionChange: stock.positionChange || 0,
                currentRank: stock.currentRank || 0,
                marketSession: stock.marketSession,
                tradingStatus: stock.tradingStatus || 'ACTIVE'
            };
        });

        // Sort movers by dayChange to determine volume-specific ranking
        movers.sort((a, b) => b.dayChange - a.dayChange);

        // Update volume ranking history and calculate position changes
        const cutoff = Date.now() - POSITION_TRACKING_WINDOW;
        movers.forEach((stock, index) => {
            const symbol = stock.symbol;
            if (!volumeRankingHistory.has(symbol)) {
                volumeRankingHistory.set(symbol, []);
            }
            const history = volumeRankingHistory.get(symbol);
            history.push({ timestamp: Date.now(), rank: index + 1 });

            // Clean old entries
            const filtered = history.filter(entry => entry.timestamp > cutoff);
            volumeRankingHistory.set(symbol, filtered);

            // Calculate position change for volume page
            let volumePositionChange = 0;
            if (filtered.length > 1) {
                const oldestEntry = filtered[0];
                volumePositionChange = oldestEntry.rank - (index + 1);
            }

            stock.volumeRank = index + 1;
            stock.volumePositionChange = volumePositionChange;
        });

        // Initialize volumeMoversCache only if empty (first time)
        // Otherwise, merge the new data while preserving historical tracking
        if (volumeMoversCache.length === 0) {
            volumeMoversCache = movers;
            console.log(`🎯 [${new Date().toISOString()}] Initialized volumeMoversCache with ${movers.length} stocks`);
        } else {
            // Create map of existing data for O(1) lookup
            const existingMap = new Map(volumeMoversCache.map(s => [s.symbol, s]));

            // Create merged array that preserves ALL existing stocks and adds new ones
            const mergedStocks = [];
            const processedSymbols = new Set();

            // First, add all new stocks with preserved historical data
            movers.forEach(newStock => {
                const existing = existingMap.get(newStock.symbol);
                if (existing && existing.buyPressure !== undefined) {
                    // Preserve historical tracking data
                    newStock.buyPressure = existing.buyPressure;
                    // IMPORTANT: Don't overwrite volumeChanges and priceChanges - they're calculated fresh
                    // The calculation happens in the map() function above using volumeHistory
                    // if (existing.volumeChanges) newStock.volumeChanges = existing.volumeChanges;
                    // if (existing.priceChanges) newStock.priceChanges = existing.priceChanges;
                }
                mergedStocks.push(newStock);
                processedSymbols.add(newStock.symbol);
            });

            // Add any existing stocks that weren't in the new data (to preserve their tracking)
            volumeMoversCache.forEach(existingStock => {
                if (!processedSymbols.has(existingStock.symbol)) {
                    // Keep the stock with its historical data intact
                    mergedStocks.push(existingStock);
                }
            });

            // Update cache with merged data
            volumeMoversCache = mergedStocks;

            const seconds = new Date().getSeconds();
            if (seconds >= 40 || seconds <= 5) {
                console.log(`✅ [${new Date().toISOString()}] Merged ${movers.length} new + ${mergedStocks.length - movers.length} existing stocks at :${seconds}s`);
                // Log sample to verify preservation
                const samplesWithBP = mergedStocks.filter(s => s.buyPressure && s.buyPressure !== 50).length;
                console.log(`   Stocks with non-default buy pressure: ${samplesWithBP}/${mergedStocks.length}`);
            }
        }

        // Don't broadcast here - let trackHistoricalData handle broadcasting
        // This prevents duplicate broadcasts and ensures consistent data
    } catch (error) {
        console.error('Error processing volume movers:', error.message);
    }
    return volumeMoversCache;
}

// Detect whale orders using aggregated trade data
async function getWhaleOrders() {
    try {
        // For now, we'll analyze the existing data for unusual volume patterns
        // In a real implementation, we'd use Polygon's trades endpoint or WebSocket
        const whales = [];
        const now = Date.now();

        // Analyze top gainers for unusual volume patterns
        for (const stock of topGainersCache.slice(0, 50)) {
            const symbol = stock.symbol;
            // Use totalVolume for accurate tracking
            const currentVolume = stock.totalVolume || stock.volume || 0;
            const price = stock.price || 0;

            // Calculate dollar volume
            const dollarVolume = currentVolume * price;

            // Get volume history
            const volHistory = volumeHistory.get(symbol) || [];

            // Calculate average volume over last 5 minutes
            let avgVolume = 0;
            if (volHistory.length > 2) {
                const recentVolumes = volHistory.slice(-10);
                avgVolume = recentVolumes.reduce((sum, h) => sum + h.volume, 0) / recentVolumes.length;
            }

            // Use admin settings for whale detection thresholds
            const dollarVolumeThreshold = adminSettings.whaleAlerts?.dollarVolumeThreshold || 1000000;
            const spikeMultiplier = adminSettings.whaleAlerts?.volumeSpikeMultiplier || 5;

            // Detect volume spikes with configurable thresholds
            const volumeSpike = avgVolume > 0 ? currentVolume / avgVolume : 1;
            const isWhale = (volumeSpike > spikeMultiplier && dollarVolume > dollarVolumeThreshold * 0.5) ||
                           dollarVolume > dollarVolumeThreshold;

            if (isWhale) {
                // Calculate volume rate (volume per minute)
                let volumeRate = 0;
                if (volHistory.length > 1) {
                    const oldestEntry = volHistory[0];
                    const timeDiff = (now - oldestEntry.time) / 60000; // in minutes
                    if (timeDiff > 0) {
                        volumeRate = (currentVolume - oldestEntry.volume) / timeDiff;
                    }
                }

                const whaleData = {
                    symbol: symbol,
                    price: price,
                    dayChange: stock.dayChange || 0,
                    volume: currentVolume,
                    dollarVolume: dollarVolume,
                    volumeSpike: volumeSpike,
                    volumeRate: volumeRate,
                    avgVolume: avgVolume,
                    timestamp: now,
                    alert: volumeSpike > 5 ? 'EXTREME' : volumeSpike > 3 ? 'HIGH' : 'MODERATE'
                };

                whales.push(whaleData);

                // Trigger Discord alert if enabled and meets threshold
                if (adminSettings.whaleAlerts?.enabled && dollarVolume >= dollarVolumeThreshold) {
                    // Send alert asynchronously (don't wait)
                    sendDiscordAlert('whale', whaleData).catch(err =>
                        console.error(`Failed to send whale alert for ${symbol}:`, err.message)
                    );
                }
            }
        }

        // Sort by dollar volume
        whales.sort((a, b) => b.dollarVolume - a.dollarVolume);

        // Keep top 20 whale orders
        whaleOrdersCache = whales.slice(0, 20);

        return whaleOrdersCache;
    } catch (error) {
        console.error('Error detecting whale orders:', error.message);
        return whaleOrdersCache;
    }
}

// Main landing page with navigation
app.get('/', (req, res) => {
    // Prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Market Scanner Hub</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
            color: #e0e0e0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px 20px;
        }

        .container {
            max-width: 1200px;
            width: 100%;
        }

        h1 {
            font-size: 3em;
            background: linear-gradient(135deg, #00ff41, #00ffff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-align: center;
            margin-bottom: 20px;
            text-shadow: 0 0 30px rgba(0, 255, 65, 0.3);
        }

        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 50px;
            font-size: 1.2em;
        }

        .scanner-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin-top: 40px;
        }

        .scanner-card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(0, 255, 65, 0.3);
            border-radius: 15px;
            padding: 30px;
            transition: all 0.3s ease;
            cursor: pointer;
            text-decoration: none;
            color: inherit;
            display: block;
            position: relative;
            overflow: hidden;
        }

        .scanner-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, transparent, rgba(0, 255, 65, 0.1));
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .scanner-card:hover {
            transform: translateY(-5px);
            border-color: #00ff41;
            box-shadow: 0 10px 30px rgba(0, 255, 65, 0.2);
        }

        .scanner-card:hover::before {
            opacity: 1;
        }

        .scanner-card h2 {
            color: #00ff41;
            margin-bottom: 15px;
            font-size: 1.5em;
        }

        .scanner-card p {
            color: #b0b0b0;
            line-height: 1.6;
            margin-bottom: 20px;
        }

        .scanner-stats {
            display: flex;
            gap: 20px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .stat {
            flex: 1;
        }

        .stat-label {
            color: #666;
            font-size: 0.8em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .stat-value {
            color: #00ffff;
            font-size: 1.2em;
            font-weight: bold;
            margin-top: 5px;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #00ff41;
            margin-right: 8px;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% {
                opacity: 1;
                transform: scale(1);
            }
            50% {
                opacity: 0.5;
                transform: scale(1.2);
            }
        }

        .api-endpoints {
            margin-top: 60px;
            padding: 30px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .api-endpoints h3 {
            color: #00ffff;
            margin-bottom: 20px;
        }

        .endpoint {
            background: rgba(0, 0, 0, 0.3);
            padding: 10px 15px;
            margin: 10px 0;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            color: #00ff41;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📈 Market Scanner Hub</h1>
        <p class="subtitle">Real-time stock market analysis and scanning tools</p>

        <div class="scanner-grid">
            <a href="/gainers" class="scanner-card">
                <h2>🔥 Top Gainers</h2>
                <p>Real-time tracking of the market's biggest gainers with position change indicators</p>
                <div class="scanner-stats">
                    <div class="stat">
                        <div class="stat-label">Refresh Rate</div>
                        <div class="stat-value">1 sec</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">WebSocket</div>
                        <div class="stat-value"><span class="status-indicator"></span>Live</div>
                    </div>
                </div>
            </a>

            <a href="/volume" class="scanner-card">
                <h2>📈 Volume Movers</h2>
                <p>Real-time volume surge detection across multiple timeframes</p>
                <div class="scanner-stats">
                    <div class="stat">
                        <div class="stat-label">Timeframes</div>
                        <div class="stat-value">30s-5m</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Updates</div>
                        <div class="stat-value">Live</div>
                    </div>
                </div>
            </a>

            <a href="/whales" class="scanner-card">
                <h2>🐋 Whale Detector</h2>
                <p>Track large orders and unusual volume activity</p>
                <div class="scanner-stats">
                    <div class="stat">
                        <div class="stat-label">Min Size</div>
                        <div class="stat-value">$500K+</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Alerts</div>
                        <div class="stat-value">Real-time</div>
                    </div>
                </div>
            </a>

            </div>

        <div class="api-endpoints">
            <h3>🔌 API Endpoints</h3>
            <div class="endpoint">GET /api/gainers - Get current top gainers</div>
            <div class="endpoint">WS ws://localhost:${WS_PORT} - WebSocket for real-time updates</div>
        </div>
    </div>
</body>
</html>
    `);
});

// Top Gainers page
app.get('/gainers', (req, res) => {
    // Prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Top Gainers - Real-time</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
            color: #e0e0e0;
            padding: 20px;
            min-height: 100vh;
        }

        .nav-bar {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(0, 255, 65, 0.3);
            border-radius: 10px;
            padding: 15px 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .nav-links {
            display: flex;
            gap: 20px;
        }

        .nav-links a {
            color: #00ff41;
            text-decoration: none;
            padding: 8px 15px;
            border-radius: 5px;
            transition: all 0.3s ease;
        }

        .nav-links a:hover {
            background: rgba(0, 255, 65, 0.1);
        }

        .nav-links a.active {
            background: rgba(0, 255, 65, 0.2);
            border: 1px solid rgba(0, 255, 65, 0.5);
        }

        h1 {
            font-size: 2.5em;
            background: linear-gradient(135deg, #00ff41, #00ffff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-align: center;
            margin-bottom: 20px;
        }

        .filters {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(0, 255, 65, 0.3);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
            display: flex;
            gap: 30px;
            flex-wrap: wrap;
            justify-content: center;
        }

        .filter-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .filter-group label {
            color: #00ffff;
            font-weight: 500;
        }

        .filter-group select,
        .filter-group input {
            background: rgba(0, 0, 0, 0.5);
            color: #e0e0e0;
            border: 1px solid rgba(0, 255, 65, 0.3);
            border-radius: 5px;
            padding: 8px 12px;
            font-size: 14px;
        }

        .status {
            text-align: center;
            padding: 15px;
            background: rgba(0, 255, 65, 0.1);
            border-radius: 10px;
            margin-bottom: 20px;
            border: 1px solid rgba(0, 255, 65, 0.3);
        }

        .status.connected {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% {
                border-color: rgba(0, 255, 65, 0.3);
            }
            50% {
                border-color: rgba(0, 255, 65, 0.8);
            }
        }

        table {
            width: 100%;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid rgba(0, 255, 65, 0.2);
        }

        th {
            background: rgba(0, 255, 65, 0.1);
            padding: 15px;
            text-align: left;
            font-weight: 600;
            color: #00ff41;
            border-bottom: 2px solid rgba(0, 255, 65, 0.3);
        }

        td {
            padding: 12px 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        tr:hover {
            background: rgba(0, 255, 65, 0.05);
        }

        .symbol {
            font-weight: bold;
            color: #00ffff;
            font-size: 1.1em;
        }

        .positive {
            color: #00ff41;
            font-weight: 500;
        }

        .negative {
            color: #ff4444;
        }

        .high-volume {
            color: #ffd700;
            font-weight: bold;
        }

        .position-change {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
            min-width: 50px;
            text-align: center;
        }

        .position-change.up {
            background: rgba(0, 255, 65, 0.2);
            color: #00ff41;
        }

        .position-change.down {
            background: rgba(255, 68, 68, 0.2);
            color: #ff4444;
        }

        .position-change.neutral {
            background: rgba(255, 255, 255, 0.1);
            color: #888;
        }
    </style>
</head>
<body>
    <div class="nav-bar">
        <div class="nav-links">
            <a href="/">🏠 Home</a>
            <a href="/gainers" class="active">🔥 Top Gainers</a>
            <a href="/volume">📊 Volume Movers</a>
        </div>
        <div id="connection-status">🔴 Connecting...</div>
    </div>

    <h1>🔥 Real-Time Top Gainers</h1>

    <div id="marketSession" style="text-align: center; margin-bottom: 20px; padding: 10px; background: rgba(0, 255, 65, 0.1); border: 1px solid rgba(0, 255, 65, 0.3); border-radius: 10px;">
        <span style="color: #00ffff; font-weight: 600;">Market Session: </span>
        <span id="sessionName" style="color: #00ff41; font-weight: bold;">Loading...</span>
    </div>

    <div class="filters">
        <div class="filter-group">
            <label for="stockLimit">Show Top:</label>
            <select id="stockLimit">
                <option value="10">10 Stocks</option>
                <option value="20">20 Stocks</option>
                <option value="30">30 Stocks</option>
                <option value="50" selected>50 Stocks</option>
                <option value="100">100 Stocks</option>
            </select>
        </div>
        <div class="filter-group">
            <label for="minGain">Min Gain:</label>
            <input type="number" id="minGain" value="0" step="0.5" style="width: 80px">
            <span>%</span>
        </div>
        <div class="filter-group">
            <label for="minVolume">Min Volume:</label>
            <select id="minVolume">
                <option value="0">Any</option>
                <option value="500000" selected>500K+</option>
                <option value="1000000">1M+</option>
                <option value="5000000">5M+</option>
                <option value="10000000">10M+</option>
            </select>
        </div>
    </div>

    <div id="status" class="status">
        <span id="count">Loading...</span> |
        <span id="lastUpdate">Never</span> |
        <span>Auto-refresh: 1 second</span>
    </div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Symbol</th>
                <th>Price</th>
                <th>Day Change</th>
                <th>Position Δ (5m)</th>
                <th>Volume</th>
                <th>$ Volume</th>
                <th>Day Range</th>
            </tr>
        </thead>
        <tbody id="stocksBody">
            <tr><td colspan="8" style="text-align: center; padding: 40px;">Loading data...</td></tr>
        </tbody>
    </table>

    <script>
        let ws;
        let allStocks = [];
        let filters = {
            limit: 50,
            minGain: 0,
            minVolume: 500000
        };

        // Connect to WebSocket
        function connect() {
            const wsHost = window.location.hostname || 'localhost';
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // For HTTPS, use /ws path (proxied by Nginx). For HTTP, use port 3051
            const wsUrl = protocol === 'wss:'
                ? protocol + '//' + wsHost + '/ws'
                : protocol + '//' + wsHost + ':3051';
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('Connected to WebSocket');
                document.getElementById('connection-status').innerHTML = '🟢 Connected';
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'gainers') {
                    allStocks = message.data;
                    updateDisplay();

                    // Update market session if provided
                    if (message.marketSession) {
                        document.getElementById('sessionName').textContent = message.marketSession;
                    }
                }
            };

            ws.onclose = () => {
                document.getElementById('connection-status').innerHTML = '🔴 Disconnected';
                setTimeout(connect, 2000);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        }

        // Update display with filters
        function updateDisplay() {
            let filteredStocks = allStocks
                .filter(stock =>
                    stock.dayChange >= filters.minGain &&
                    stock.volume >= filters.minVolume
                )
                .slice(0, filters.limit);

            const tbody = document.getElementById('stocksBody');
            tbody.innerHTML = '';

            if (filteredStocks.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;">No stocks match the current filters</td></tr>';
                document.getElementById('count').textContent = 'No stocks found';
                return;
            }

            filteredStocks.forEach((stock, index) => {
                const row = tbody.insertRow();

                // Determine position change styling
                let positionClass = 'neutral';
                let positionText = '—';
                if (stock.positionChange > 0) {
                    positionClass = 'up';
                    positionText = '+' + stock.positionChange;
                } else if (stock.positionChange < 0) {
                    positionClass = 'down';
                    positionText = stock.positionChange.toString();
                }

                const volumeClass = stock.volume > 5000000 ? 'high-volume' : '';

                row.innerHTML = \`
                    <td>\${index + 1}</td>
                    <td class="symbol">\${stock.symbol}</td>
                    <td>$\${stock.price.toFixed(2)}</td>
                    <td class="positive">+\${stock.dayChange.toFixed(2)}%</td>
                    <td><span class="position-change \${positionClass}">\${positionText}</span></td>
                    <td class="\${volumeClass}">\${(stock.volume/1000000).toFixed(1)}M</td>
                    <td>$\${(stock.dollarVolume/1000000).toFixed(1)}M</td>
                    <td>$\${stock.low.toFixed(2)} - $\${stock.high.toFixed(2)}</td>
                \`;
            });

            document.getElementById('count').textContent = \`Showing \${filteredStocks.length} stocks\`;
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
        }

        // Setup filter event listeners
        document.getElementById('stockLimit').addEventListener('change', (e) => {
            filters.limit = parseInt(e.target.value);
            updateDisplay();
        });

        document.getElementById('minGain').addEventListener('input', (e) => {
            filters.minGain = parseFloat(e.target.value) || 0;
            updateDisplay();
        });

        document.getElementById('minVolume').addEventListener('change', (e) => {
            filters.minVolume = parseInt(e.target.value);
            updateDisplay();
        });

        // Start connection
        connect();
    </script>
</body>
</html>
    `);
});

// Rising stocks page


// Spike detector page (placeholder)


// Volume Movers page
app.get('/volume', (req, res) => {
    // Prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'volume-movers-page.html'), 'utf8');
    res.send(htmlContent);
});

// Whale detector page
app.get('/whales', (req, res) => {
    // Prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'whales-page.html'), 'utf8');
    res.send(htmlContent);
});

// Admin alerts page
app.get('/admin', (req, res) => {
    // Prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'admin-alerts.html'), 'utf8');
    res.send(htmlContent);
});

// Daily3 dip pattern page
app.get('/daily3', (req, res) => {
    // Prevent caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const htmlContent = fs.readFileSync(path.join(__dirname, 'daily3-page.html'), 'utf8');
    res.send(htmlContent);
});

// API endpoints
app.get('/api/gainers', async (req, res) => {
    const gainers = await getTopGainers();
    res.json({
        success: true,
        count: gainers.length,
        stocks: gainers
    });
});

app.get('/api/rising', async (req, res) => {
    const stocks = await getRisingStocks();
    res.json({
        success: true,
        count: stocks.length,
        criteria: {
            minDayChange: 1.2,
            minVolume: 500000,
            maxPrice: 500
        },
        stocks: stocks
    });
});

app.get('/api/volume', async (req, res) => {
    let stocks = await getVolumeMovers();

    // Get sorting parameters
    const sortBy = req.query.sortBy || 'dayChange';  // dayChange, priceChange30s, priceChange1m, volumeChange30s, volumeChange1m, etc.
    const sortOrder = req.query.sortOrder || 'desc';  // asc or desc
    const secondarySort = req.query.secondarySort;  // Optional secondary sort

    // Apply sorting
    stocks = stocks.sort((a, b) => {
        let compareValue = 0;

        // Primary sort
        if (sortBy === 'dayChange') {
            compareValue = (b.dayChange || 0) - (a.dayChange || 0);
        } else if (sortBy.startsWith('priceChange')) {
            const timeframe = sortBy.replace('priceChange', '');
            compareValue = (b.priceChanges?.[timeframe] || 0) - (a.priceChanges?.[timeframe] || 0);
        } else if (sortBy.startsWith('volumeChange')) {
            const timeframe = sortBy.replace('volumeChange', '');
            compareValue = (b.volumeChanges?.[timeframe] || 0) - (a.volumeChanges?.[timeframe] || 0);
        }

        // If primary sort values are equal and secondary sort is specified
        if (compareValue === 0 && secondarySort) {
            if (secondarySort === 'dayChange') {
                compareValue = (b.dayChange || 0) - (a.dayChange || 0);
            } else if (secondarySort.startsWith('priceChange')) {
                const timeframe = secondarySort.replace('priceChange', '');
                compareValue = (b.priceChanges?.[timeframe] || 0) - (a.priceChanges?.[timeframe] || 0);
            } else if (secondarySort.startsWith('volumeChange')) {
                const timeframe = secondarySort.replace('volumeChange', '');
                compareValue = (b.volumeChanges?.[timeframe] || 0) - (a.volumeChanges?.[timeframe] || 0);
            }
        }

        // Handle sort order
        return sortOrder === 'asc' ? -compareValue : compareValue;
    });

    res.json({
        success: true,
        count: stocks.length,
        stocks: stocks,
        sortBy: sortBy,
        sortOrder: sortOrder,
        secondarySort: secondarySort,
        marketSession: getMarketSession()
    });
});

app.get('/api/spikes', (req, res) => {
    res.json({
        success: true,
        message: 'Spike detection endpoint - coming soon',
        spikes: []
    });
});

// Whale detector API
app.get('/api/whales', async (req, res) => {
    const whales = await getWhaleOrders();
    res.json({
        success: true,
        count: whales.length,
        whales: whales,
        marketSession: getMarketSession()
    });
});

// Daily3 dip pattern API
app.get('/api/daily3', async (req, res) => {
    try {
        // Get filter parameters from query string
        const minPrice = parseFloat(req.query.minPrice) || 5;
        const maxPrice = parseFloat(req.query.maxPrice) || 500;
        const minDipPercent = parseFloat(req.query.minDipPercent) || 1.5;

        // Check if we need to refresh the data (refresh once per day before market open)
        const now = new Date();
        const shouldRefresh = !daily3LastUpdate ||
                             (now - daily3LastUpdate > 24 * 60 * 60 * 1000) ||
                             (now.getHours() < 9 && daily3LastUpdate.getDate() !== now.getDate());

        if (shouldRefresh) {
            console.log('🔄 Refreshing Daily3 dip pattern data...');
            daily3Cache = await getDaily3DipPatterns(minPrice, maxPrice, minDipPercent);
            daily3LastUpdate = now;
        }

        // Filter cached results based on current parameters
        const filtered = daily3Cache.filter(stock =>
            stock.currentPrice >= minPrice &&
            stock.currentPrice <= maxPrice &&
            stock.dipPattern.avgDipPercent <= -minDipPercent
        );

        res.json({
            success: true,
            lastUpdated: daily3LastUpdate,
            count: filtered.length,
            filters: { minPrice, maxPrice, minDipPercent },
            stocks: filtered
        });
    } catch (error) {
        console.error('❌ Error in Daily3 API:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// ADMIN API ENDPOINTS
// ============================================

// Load admin settings
let adminSettings = {};
const SETTINGS_FILE = path.join(__dirname, 'admin-settings.json');

function loadAdminSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            adminSettings = JSON.parse(data);
            console.log('✅ Admin settings loaded');
        } else {
            console.log('⚠️  Admin settings file not found, using defaults');
            adminSettings = {
                webhooks: { news: '', whale: '', rocket: '', urgent: '' },
                newsAlerts: { enabled: false, keywords: [], minPriceChange: 10, minVolume: 1000000 },
                whaleAlerts: { enabled: false, dollarVolumeThreshold: 1000000, volumeSpikeMultiplier: 5 },
                masterEnabled: true
            };
        }
    } catch (error) {
        console.error('❌ Error loading admin settings:', error.message);
    }
}

function saveAdminSettings() {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(adminSettings, null, 2));
        console.log('✅ Admin settings saved');
    } catch (error) {
        console.error('❌ Error saving admin settings:', error.message);
    }
}

// Initialize settings on startup
loadAdminSettings();

// Track sent alerts to prevent duplicates
const sentAlerts = new Map(); // key: `${type}-${symbol}-${date}`, value: timestamp

// Clean old alerts every hour
setInterval(() => {
    const now = Date.now();
    const window = adminSettings.duplicatePreventionWindow || 3600000; // 1 hour default
    for (const [key, timestamp] of sentAlerts.entries()) {
        if (now - timestamp > window) {
            sentAlerts.delete(key);
        }
    }
    if (sentAlerts.size > 250) {
        // Keep only the 250 most recent
        const entries = Array.from(sentAlerts.entries()).sort((a, b) => b[1] - a[1]);
        sentAlerts.clear();
        entries.slice(0, 250).forEach(([k, v]) => sentAlerts.set(k, v));
    }
}, 60000);

// Discord alert sender
async function sendDiscordAlert(type, data, forceTest = false) {
    try {
        // Skip enabled checks if this is a test
        if (!forceTest) {
            if (adminSettings.masterEnabled === false) {
                console.log('⚠️  Master alerts disabled, skipping');
                return false;
            }

            // Check type-specific enabled status
            if (type === 'news' && !adminSettings.newsAlerts?.enabled) {
                console.log('⚠️  News alerts disabled');
                return false;
            }
            if (type === 'whale' && !adminSettings.whaleAlerts?.enabled) {
                console.log('⚠️  Whale alerts disabled');
                return false;
            }
        }

        // Get webhook URL
        const webhookUrl = adminSettings.webhooks?.[type];
        if (!webhookUrl) {
            console.log(`⚠️  No webhook configured for ${type}`);
            return false;
        }

        // Check for duplicate (skip for tests)
        const alertKey = `${type}-${data.symbol}-${new Date().toDateString()}`;
        if (!forceTest && sentAlerts.has(alertKey)) {
            console.log(`⏭️  Skipping duplicate alert: ${alertKey}`);
            return false;
        }

        // Build Discord embed based on type
        let embed = {};

        if (type === 'news') {
            embed = {
                title: `📰 BREAKING NEWS: ${data.symbol}`,
                description: data.headline,
                color: 0x5865F2, // Discord blue
                fields: [
                    { name: 'Price', value: `$${data.price?.toFixed(2) || 'N/A'}`, inline: true },
                    { name: 'Change', value: `${data.changePercent >= 0 ? '+' : ''}${data.changePercent?.toFixed(1) || '0'}%`, inline: true },
                    { name: 'Volume', value: formatVolume(data.volume), inline: true },
                    { name: 'Source', value: data.source || 'Unknown', inline: true },
                    { name: 'Time', value: new Date(data.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) + ' ET', inline: true }
                ],
                footer: { text: 'Market Scanner - News Alert' },
                timestamp: new Date().toISOString()
            };
            if (data.url) {
                embed.url = data.url;
            }
        } else if (type === 'whale') {
            const alertLevel = data.dollarVolume >= adminSettings.whaleAlerts.levels.extreme ? '🚨 EXTREME' :
                              data.dollarVolume >= adminSettings.whaleAlerts.levels.high ? '⚠️ HIGH' : 'ℹ️ MODERATE';

            embed = {
                title: `🐋 WHALE ALERT: ${data.symbol}`,
                description: `Large order detected - ${alertLevel}`,
                color: data.dollarVolume >= 5000000 ? 0xFF0000 : // Red for extreme
                       data.dollarVolume >= 1000000 ? 0xFF6600 : // Orange for high
                       0xFFCC00, // Yellow for moderate
                fields: [
                    { name: 'Dollar Volume', value: `$${(data.dollarVolume / 1000000).toFixed(2)}M`, inline: true },
                    { name: 'Price', value: `$${data.price?.toFixed(2)}`, inline: true },
                    { name: 'Change', value: `${data.dayChange >= 0 ? '+' : ''}${data.dayChange?.toFixed(1)}%`, inline: true },
                    { name: 'Volume Spike', value: `${data.volumeSpike?.toFixed(1)}x avg`, inline: true },
                    { name: 'Rate', value: `${formatVolume(data.volumeRate)}/min`, inline: true },
                    { name: 'Alert Level', value: alertLevel, inline: true }
                ],
                footer: { text: 'Market Scanner - Whale Alert' },
                timestamp: new Date().toISOString()
            };
        }

        // Send to Discord
        await axios.post(webhookUrl, { embeds: [embed] });

        // Mark as sent
        sentAlerts.set(alertKey, Date.now());
        console.log(`✅ ${type.toUpperCase()} alert sent: ${data.symbol}`);
        return true;
    } catch (error) {
        console.error(`❌ Error sending ${type} alert:`, error.message);
        return false;
    }
}

// Helper function to format volume
function formatVolume(vol) {
    if (!vol) return '0';
    if (vol >= 1000000000) return (vol / 1000000000).toFixed(2) + 'B';
    if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(2) + 'K';
    return vol.toString();
}

// GET admin settings
app.get('/api/admin/settings', (req, res) => {
    res.json({
        success: true,
        settings: adminSettings
    });
});

// POST update admin settings
app.post('/api/admin/settings', (req, res) => {
    try {
        adminSettings = { ...adminSettings, ...req.body };
        saveAdminSettings();
        res.json({
            success: true,
            message: 'Settings updated successfully',
            settings: adminSettings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST test webhook
app.post('/api/admin/test-webhook', async (req, res) => {
    try {
        const { type } = req.body;

        const testData = {
            symbol: 'TEST',
            price: 10.50,
            changePercent: 25.5,
            volume: 5200000,
            timestamp: Date.now()
        };

        if (type === 'news') {
            testData.headline = 'Test news alert from Market Scanner';
            testData.source = 'Test';
            testData.url = 'https://daily3club.com';
        } else if (type === 'whale') {
            testData.dollarVolume = 2500000;
            testData.dayChange = 15.5;
            testData.volumeSpike = 6.2;
            testData.volumeRate = 125000;
        }

        // Force test to bypass enabled checks
        const sent = await sendDiscordAlert(type, testData, true);

        res.json({
            success: sent,
            message: sent ? 'Test alert sent successfully! Check your Discord channel.' : 'Failed to send test alert. Check webhook URL.'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// END ADMIN API ENDPOINTS
// ============================================

// News detection cache
let newsCache = new Map(); // symbol -> array of news items
let lastNewsCheck = 0;

// Fetch and check news for current gainers
async function checkNewsAlerts() {
    try {
        if (!adminSettings.newsAlerts?.enabled) {
            return;
        }

        const now = Date.now();
        const checkInterval = adminSettings.newsAlerts.checkInterval || 60000;

        // Only check news every interval (default 60s)
        if (now - lastNewsCheck < checkInterval) {
            return;
        }
        lastNewsCheck = now;

        // Get top gainers to check for news
        const topStocks = topGainersCache.slice(0, 20); // Check top 20

        for (const stock of topStocks) {
            const symbol = stock.symbol;

            // Skip if doesn't meet minimum criteria
            if (stock.dayChange < adminSettings.newsAlerts.minPriceChange) continue;
            if (stock.volume < adminSettings.newsAlerts.minVolume) continue;

            try {
                // Fetch news from Polygon
                const newsUrl = `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${POLYGON_API_KEY}`;
                const response = await axios.get(newsUrl, { timeout: 5000 });

                if (response.data && response.data.results) {
                    const recentNews = response.data.results.filter(item => {
                        // Only news from last 24 hours
                        const newsAge = now - new Date(item.published_utc).getTime();
                        return newsAge < 24 * 60 * 60 * 1000;
                    });

                    for (const newsItem of recentNews) {
                        // Check if news matches keywords
                        const headline = newsItem.title.toLowerCase();
                        const hasKeyword = adminSettings.newsAlerts.keywords.some(keyword =>
                            headline.includes(keyword.toLowerCase())
                        );

                        if (hasKeyword) {
                            // Check if we already sent this news
                            const newsKey = `${symbol}-${newsItem.id || newsItem.title}`;
                            if (!newsCache.has(newsKey)) {
                                newsCache.set(newsKey, Date.now());

                                // Send Discord alert
                                await sendDiscordAlert('news', {
                                    symbol: symbol,
                                    headline: newsItem.title,
                                    price: stock.price,
                                    changePercent: stock.dayChange,
                                    volume: stock.volume,
                                    source: newsItem.publisher?.name || 'Unknown',
                                    url: newsItem.article_url,
                                    timestamp: new Date(newsItem.published_utc).getTime()
                                });

                                console.log(`📰 News alert triggered for ${symbol}: ${newsItem.title}`);
                            }
                        }
                    }
                }
            } catch (error) {
                // Silently continue on error for individual stocks
                if (!error.message.includes('timeout')) {
                    console.error(`Error checking news for ${symbol}:`, error.message);
                }
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Clean old news cache (keep last 24 hours)
        for (const [key, timestamp] of newsCache.entries()) {
            if (now - timestamp > 24 * 60 * 60 * 1000) {
                newsCache.delete(key);
            }
        }
    } catch (error) {
        console.error('Error in news checking:', error.message);
    }
}

// Calculate buy pressure for a single stock
const calculateBuyPressure = (priceChanges, volumeChanges, dayChange = 0, currentVolume = 0, volumeRate = 0) => {
    let buyPressure = 50; // Neutral baseline

    // Factor 1: Short-term price movement (25% weight)
    const price30s = priceChanges['30s'] || 0;
    if (price30s !== 0) {
        buyPressure += Math.min(12.5, Math.max(-12.5, price30s * 2.5));
    }

    // Factor 2: Volume analysis (25% weight) - Enhanced with volume rate
    const vol30s = volumeChanges['30s'] || 0;
    const vol1m = volumeChanges['1m'] || 0;

    // Volume rate contribution (more important than static changes)
    if (volumeRate > 0) {
        // Scale volume rate: 10k/min = +3, 50k/min = +6, 100k+/min = +10
        let rateBonus = 0;
        if (volumeRate >= 100000) rateBonus = 10;
        else if (volumeRate >= 50000) rateBonus = 6;
        else if (volumeRate >= 10000) rateBonus = 3;
        else if (volumeRate >= 1000) rateBonus = 1;

        // Apply rate bonus with price direction
        if (price30s >= 0) {
            buyPressure += Math.min(12.5, rateBonus);
        } else {
            buyPressure -= Math.min(6, rateBonus * 0.5); // Less penalty when selling
        }
    }

    // Traditional volume changes (reduced weight when rate is available)
    const volWeight = volumeRate > 0 ? 10 : 20;
    if (vol30s > 0 && price30s > 0) {
        buyPressure += Math.min(12.5 - (volumeRate > 0 ? 5 : 0), vol30s / volWeight);
    } else if (vol30s > 0 && price30s < 0) {
        buyPressure -= Math.min(12.5 - (volumeRate > 0 ? 5 : 0), vol30s / volWeight);
    }

    // Factor 3: Day performance bias (25% weight)
    // Use day change as a baseline when short-term data is flat
    if (dayChange > 0) {
        buyPressure += Math.min(12.5, dayChange / 4); // Positive day = bullish bias
    } else if (dayChange < 0) {
        buyPressure += Math.max(-12.5, dayChange / 4); // Negative day = bearish bias
    }

    // Factor 4: Trend consistency (25% weight)
    const trend1m = priceChanges['1m'] || 0;
    const trend2m = priceChanges['2m'] || 0;

    // All trends aligned in same direction = stronger signal
    if (price30s > 0 && trend1m > 0) {
        buyPressure += 6.25; // Consistent buying
    } else if (price30s < 0 && trend1m < 0) {
        buyPressure -= 6.25; // Consistent selling
    }

    // Longer trend alignment
    if (trend1m > 0 && trend2m > 0) {
        buyPressure += 6.25; // Sustained momentum
    } else if (trend1m < 0 && trend2m < 0) {
        buyPressure -= 6.25; // Sustained decline
    }

    // Volume strength modifier
    if (currentVolume > 1000000) {
        // High volume makes the signal more reliable
        const volumeFactor = Math.min(1.2, 1 + (currentVolume / 10000000));
        buyPressure = 50 + (buyPressure - 50) * volumeFactor;
    }

    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, buyPressure));
};

// Track historical data and update buy pressure independently from API updates
const trackHistoricalData = () => {
    const now = Date.now();
    const seconds = new Date().getSeconds();

    // Log around the problem time
    if (seconds >= 40 || seconds <= 5) {
        console.log(`📊 [${new Date().toISOString()}] Historical tracking at :${seconds}s`);
        console.log(`   - volumeMoversCache: ${volumeMoversCache.length} stocks`);
        console.log(`   - Tracking independent of API updates`);
    }

    // Use volumeMoversCache as the source if it has data, otherwise skip
    if (volumeMoversCache.length === 0) {
        if (seconds >= 40 || seconds <= 5) {
            console.log(`⚠️ [${new Date().toISOString()}] No data in volumeMoversCache at :${seconds}s`);
        }
        return; // No data yet
    }

    // Log Map sizes to debug potential clearing
    if (seconds >= 40 || seconds <= 5) {
        console.log(`   📊 volumeHistory Map size: ${volumeHistory.size} symbols`);
        console.log(`   📊 priceHistory Map size: ${priceHistory.size} symbols`);
    }

    // Process stocks from existing volumeMoversCache (preserving all data)
    const processedStocks = volumeMoversCache.map(stock => {
        const symbol = stock.symbol;
        // IMPORTANT: Always use totalVolume for tracking changes
        // stock.volume is session-specific and will reset, causing 0% changes
        const currentVolume = stock.totalVolume || 0;
        const currentPrice = stock.price || stock.currentPrice;

        // Initialize history if needed
        if (!volumeHistory.has(symbol)) {
            volumeHistory.set(symbol, []);
        }
        if (!priceHistory.has(symbol)) {
            priceHistory.set(symbol, []);
        }

        const volHistory = volumeHistory.get(symbol);
        const prcHistory = priceHistory.get(symbol);

        // Track volume changes and calculate volume rate
        const lastSnapshot = lastVolumeSnapshot.get(symbol) || { volume: currentVolume, time: now - 1000 };
        const volumeDelta = currentVolume - lastSnapshot.volume;
        const timeDelta = (now - lastSnapshot.time) / 1000; // in seconds

        // Update last snapshot if volume changed
        if (volumeDelta > 0) {
            lastVolumeSnapshot.set(symbol, { volume: currentVolume, time: now });
        }

        // Calculate volume rate (volume per minute)
        let volumeRate = 0;
        if (timeDelta > 0 && volumeDelta > 0) {
            volumeRate = (volumeDelta / timeDelta) * 60; // Convert to per minute
        }

        // Store volume rate history
        if (!volumeRateHistory.has(symbol)) {
            volumeRateHistory.set(symbol, []);
        }
        const rateHistory = volumeRateHistory.get(symbol);
        if (volumeRate > 0) {
            rateHistory.push({ time: now, rate: volumeRate });
        }

        // Keep only last 5 minutes of rate history
        const fiveMinutesAgo = now - 300000;
        while (rateHistory.length > 0 && rateHistory[0].time < fiveMinutesAgo) {
            rateHistory.shift();
        }

        // Calculate average volume rate over last minute
        const oneMinuteAgo = now - 60000;
        const recentRates = rateHistory.filter(r => r.time >= oneMinuteAgo);
        const avgVolumeRate = recentRates.length > 0
            ? recentRates.reduce((sum, r) => sum + r.rate, 0) / recentRates.length
            : volumeRate;

        // IMPORTANT: DO NOT update priceHistory or volumeHistory here!
        // This function runs during broadcast intervals and uses cached data.
        // History should ONLY be updated when fresh API data arrives.
        // The old code was pushing the same cached price/volume repeatedly,
        // causing priceHistory to fill with duplicates resulting in 0% changes.

        // Clean old entries from existing history (maintenance only)
        // Note: fiveMinutesAgo already declared above for rateHistory
        while (volHistory.length > 0 && volHistory[0].time < fiveMinutesAgo) {
            volHistory.shift();
        }
        while (prcHistory.length > 0 && prcHistory[0].time < fiveMinutesAgo) {
            prcHistory.shift();
        }

        // Calculate current price and volume changes
        const volumeChanges = {};
        const priceChanges = {};

        for (const [label, seconds] of Object.entries(VOLUME_TIMEFRAMES)) {
            const targetTime = now - (seconds * 1000);
            // Use more lenient tolerance or fallback to oldest available data
            let oldVolEntry = volHistory.find(h => Math.abs(h.time - targetTime) < 10000);
            let oldPrcEntry = prcHistory.find(h => Math.abs(h.time - targetTime) < 10000);

            // If no exact match and we have some history, use the oldest available
            if (!oldVolEntry && volHistory.length > 0 && seconds === 30) {
                // For 30s timeframe, use oldest if we have less than 30s of data
                const oldestVol = volHistory[0];
                if (now - oldestVol.time < 30000) {
                    oldVolEntry = oldestVol;
                }
            }
            if (!oldPrcEntry && prcHistory.length > 0 && seconds === 30) {
                const oldestPrc = prcHistory[0];
                if (now - oldestPrc.time < 30000) {
                    oldPrcEntry = oldestPrc;
                }
            }

            if (oldVolEntry && currentVolume > 0 && oldVolEntry.volume > 0) {
                const volChange = ((currentVolume - oldVolEntry.volume) / oldVolEntry.volume) * 100;
                volumeChanges[label] = volChange;
                // Debug log significant volume changes
                if (label === '30s' && Math.abs(volChange) > 0.1 && volumeMoversCache.indexOf(stock) < 3) {
                    console.log(`📊 TRACK ${symbol} 30s vol: ${volChange.toFixed(2)}% (${oldVolEntry.volume} → ${currentVolume})`);
                }
            } else {
                volumeChanges[label] = 0;
            }

            if (oldPrcEntry && currentPrice > 0 && oldPrcEntry.price > 0) {
                priceChanges[label] = ((currentPrice - oldPrcEntry.price) / oldPrcEntry.price) * 100;
            } else {
                priceChanges[label] = 0;
            }
        }

        // Update buy pressure calculation with volume rate as additional factor
        const updatedBuyPressure = calculateBuyPressure(priceChanges, volumeChanges, stock.dayChange, currentVolume, avgVolumeRate);

        // Debug log for first few stocks around problem time
        if ((seconds >= 40 || seconds <= 5) && volumeMoversCache.indexOf(stock) < 3) {
            const oldestEntry = volHistory.length > 0 ? volHistory[0] : null;
            const ageInSeconds = oldestEntry ? Math.floor((now - oldestEntry.time) / 1000) : 0;
            console.log(`   🎯 ${symbol}: hist=${volHistory.length} entries, oldest=${ageInSeconds}s ago, 30s-change=${priceChanges['30s']?.toFixed(2)}%, BP=${updatedBuyPressure}`);
        }

        // Calculate trade activity indicator
        const hasVolumeActivity = volumeDelta > 0;
        const volumeAcceleration = volumeRate > avgVolumeRate ? 'increasing' : volumeRate > 0 ? 'steady' : 'none';

        // Return updated stock with enhanced metrics
        return {
            ...stock,
            volumeChanges: volumeChanges,
            priceChanges: priceChanges,
            buyPressure: updatedBuyPressure,
            volumeRate: Math.round(volumeRate),
            avgVolumeRate: Math.round(avgVolumeRate),
            volumeDelta: Math.round(volumeDelta),
            hasVolumeActivity,
            volumeAcceleration,
            lastVolumeUpdate: volumeDelta > 0 ? new Date(now).toISOString() : new Date(lastSnapshot.time).toISOString()
        };
    });

    // Update the volumeMoversCache with processed stocks
    volumeMoversCache = processedStocks;

    // Log broadcast details around problem time
    if (seconds >= 40 || seconds <= 5) {
        console.log(`📡 [${new Date().toISOString()}] Broadcasting at :${seconds}s with ${volumeMoversCache.length} stocks`);
        // Sample first stock to check data
        if (volumeMoversCache.length > 0) {
            const sample = volumeMoversCache[0];
            console.log(`   Sample: ${sample.symbol} - Price changes: 30s=${sample.priceChanges?.['30s']?.toFixed(2) || 'N/A'}%, Buy Pressure: ${sample.buyPressure || 'N/A'}`);
        }
    }

    // Broadcast updated data with fresh buy pressure
    broadcast({
        type: 'volumeMovers',
        data: volumeMoversCache,
        marketSession: getMarketSession()
    });
};

// Dynamic update interval based on market hours
let updateInterval;
let broadcastInterval;
let historicalTrackingInterval;
let isUpdating = false;

const startUpdates = () => {
    if (updateInterval) clearInterval(updateInterval);
    if (broadcastInterval) clearInterval(broadcastInterval);
    if (historicalTrackingInterval) clearInterval(historicalTrackingInterval);

    const marketSession = getMarketSession();
    // Use 1 second during market hours for real-time updates, 60 seconds when closed
    const interval = marketSession === 'Closed' ? 60000 : 1000;

    // Track historical data every second during market hours
    if (marketSession !== 'Closed') {
        historicalTrackingInterval = setInterval(trackHistoricalData, 1000);
    }

    updateInterval = setInterval(async () => {
        const seconds = new Date().getSeconds();

        // Enhanced logging for debugging the pause
        if (seconds >= 40 || seconds <= 5) {
            console.log(`\n🔵 [${new Date().toISOString()}] Update interval triggered at :${seconds}s`);
            console.log(`   isUpdating: ${isUpdating}`);
            console.log(`   volumeMoversCache: ${volumeMoversCache.length} stocks`);
        }

        if (isUpdating) {
            console.log(`⏳ [${new Date().toISOString()}] SKIPPED at :${seconds}s - Previous update still running`);
            return;
        }

        isUpdating = true;
        // Run all three updates in parallel to prevent blocking
        const startTime = Date.now();

        console.log(`🔄 [${new Date().toISOString()}] Starting API updates at :${seconds}s`);

        try {
            // Log individual API call timing
            const [gainersResult, volumeResult, whalesResult] = await Promise.all([
                getTopGainers().then(r => {
                    const time = Date.now() - startTime;
                    if (seconds >= 40 || seconds <= 5) {
                        console.log(`   ✓ Gainers API: ${time}ms`);
                    }
                    return r;
                }).catch(err => {
                    console.error('Error updating gainers:', err);
                    return null;
                }),
                getVolumeMovers().then(r => {
                    const time = Date.now() - startTime;
                    if (seconds >= 40 || seconds <= 5) {
                        console.log(`   ✓ Volume API: ${time}ms`);
                    }
                    return r;
                }).catch(err => {
                    console.error('Error updating volume movers:', err);
                    return null;
                }),
                getWhaleOrders().then(r => {
                    const time = Date.now() - startTime;
                    if (seconds >= 40 || seconds <= 5) {
                        console.log(`   ✓ Whales API: ${time}ms`);
                    }
                    return r;
                }).catch(err => {
                    console.error('Error updating whale orders:', err);
                    return null;
                })
            ]);

            const updateTime = Date.now() - startTime;
            const endSeconds = new Date().getSeconds();

            if (updateTime > 1500) {
                console.log(`⚠️ SLOW UPDATE: ${updateTime}ms (from :${seconds}s to :${endSeconds}s)`);
            }

            console.log(`✅ [${new Date().toISOString()}] Updates completed in ${updateTime}ms at :${endSeconds}s`);

            // Check for news alerts (non-blocking)
            checkNewsAlerts().catch(err => console.error('News check error:', err.message));

        } finally {
            isUpdating = false;
        }

        const currentSession = getMarketSession();

        // Broadcast volume movers to WebSocket clients
        broadcast({
            type: 'volumeMovers',
            data: volumeMoversCache,
            marketSession: currentSession
        });

        // Broadcast whale orders to WebSocket clients
        broadcast({
            type: 'whales',
            whales: whaleOrdersCache
        });

        console.log(`✅ Updated ${topGainersCache.length} gainers, ${volumeMoversCache.length} volume, ${whaleOrdersCache.length} whales | Session: ${currentSession}`);

        // Check if market session changed to adjust interval
        if ((currentSession === 'Closed' && interval === 1000) ||
            (currentSession !== 'Closed' && interval === 60000)) {
            startUpdates(); // Restart with new interval
        }
    }, interval);

    console.log(`📊 Update interval set to ${interval/1000} seconds (Market: ${marketSession})`);

    // Separate broadcast interval that runs every second during market hours
    // This ensures clients get updates even if API calls are slow
    if (marketSession !== 'Closed') {
        broadcastInterval = setInterval(() => {
            if (!isUpdating) {
                broadcast({
                    type: 'volumeMovers',
                    data: volumeMoversCache,
                    marketSession: getMarketSession()
                });
            }
        }, 1000);
    }
};

// Start the updates
startUpdates();

// Update rising stocks every 10 seconds
setInterval(async () => {
    await getRisingStocks();
}, 10000);

// Start server
console.log(`🔄 Attempting to start HTTP server on port ${PORT}...`);
const server = app.listen(PORT, () => {
    console.log(`\n🚀 UNIFIED MARKET SCANNER HUB`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 Main Hub: http://localhost:${PORT}`);
    console.log(`📡 Top Gainers: http://localhost:${PORT}/gainers`);
    console.log(`📡 Volume Movers: http://localhost:${PORT}/volume`);
    console.log(`📡 Whale Detector: http://localhost:${PORT}/whales`);
    console.log(`📡 Daily3 Dip Scanner: http://localhost:${PORT}/daily3`);
    console.log(`📡 WebSocket: ws://localhost:${WS_PORT}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
console.log(`🔄 app.listen() called, waiting for server to start...`);

// Add error handler for HTTP server
server.on('error', (error) => {
    console.error(`❌ HTTP server error:`, error.message);
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please free the port or change PORT environment variable.`);
        process.exit(1);
    }
});