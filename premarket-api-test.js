const axios = require('axios');

const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Function to get today's date in YYYY-MM-DD format
function getTodayDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

// Fetch true pre-market data for a stock using aggregates
async function fetchPreMarketData(symbol) {
    try {
        const today = getTodayDate();
        
        // Pre-market is from 4:00 AM to 9:30 AM ET
        // We need to fetch minute bars from 4:00 AM to 9:30 AM
        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/1/minute/${today}/${today}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        
        console.log(`\n📊 Fetching pre-market data for ${symbol}...`);
        console.log(`URL: ${url}`);
        
        const response = await axios.get(url);
        
        if (response.data && response.data.results) {
            const bars = response.data.results;
            
            // Filter for pre-market hours (4:00 AM to 9:30 AM ET)
            // Timestamps are in milliseconds
            const premarketBars = bars.filter(bar => {
                const date = new Date(bar.t);
                const hour = date.getUTCHours() - 5; // Convert to ET (UTC-5)
                const minute = date.getMinutes();
                const totalMinutes = hour * 60 + minute;
                
                // Pre-market: 4:00 AM (240 minutes) to 9:30 AM (570 minutes)
                return totalMinutes >= 240 && totalMinutes < 570;
            });
            
            if (premarketBars.length > 0) {
                // Calculate pre-market volume (sum of all pre-market minute volumes)
                const premarketVolume = premarketBars.reduce((sum, bar) => sum + (bar.v || 0), 0);
                
                // Get first and last pre-market prices
                const firstBar = premarketBars[0];
                const lastBar = premarketBars[premarketBars.length - 1];
                
                // Calculate pre-market high/low
                const premarketHigh = Math.max(...premarketBars.map(bar => bar.h || 0));
                const premarketLow = Math.min(...premarketBars.filter(bar => bar.l > 0).map(bar => bar.l));
                
                // Calculate pre-market VWAP
                let totalValue = 0;
                let totalVolume = 0;
                premarketBars.forEach(bar => {
                    if (bar.v && bar.vw) {
                        totalValue += bar.vw * bar.v;
                        totalVolume += bar.v;
                    }
                });
                const premarketVWAP = totalVolume > 0 ? totalValue / totalVolume : 0;
                
                console.log(`\n✅ ${symbol} Pre-Market Data:`);
                console.log(`  Pre-Market Bars: ${premarketBars.length}`);
                console.log(`  Pre-Market Volume: ${premarketVolume.toLocaleString()}`);
                console.log(`  Pre-Market Open: $${firstBar.o}`);
                console.log(`  Pre-Market Last: $${lastBar.c}`);
                console.log(`  Pre-Market High: $${premarketHigh}`);
                console.log(`  Pre-Market Low: $${premarketLow}`);
                console.log(`  Pre-Market VWAP: $${premarketVWAP.toFixed(2)}`);
                console.log(`  Pre-Market Change: ${((lastBar.c - firstBar.o) / firstBar.o * 100).toFixed(2)}%`);
                
                return {
                    symbol,
                    premarketVolume,
                    premarketOpen: firstBar.o,
                    premarketLast: lastBar.c,
                    premarketHigh,
                    premarketLow,
                    premarketVWAP,
                    premarketChange: lastBar.c - firstBar.o,
                    premarketChangePercent: ((lastBar.c - firstBar.o) / firstBar.o * 100),
                    premarketBars: premarketBars.length
                };
            } else {
                console.log(`❌ No pre-market data found for ${symbol}`);
                return null;
            }
        }
    } catch (error) {
        console.error(`Error fetching pre-market data for ${symbol}:`, error.message);
        return null;
    }
}

// Test with multiple stocks
async function testPreMarketData() {
    const testSymbols = ['TSLA', 'NVDA', 'SPY', 'QQQ', 'AAPL'];
    
    console.log('🔍 Testing Pre-Market Data Fetching...');
    console.log(`Today's Date: ${getTodayDate()}`);
    console.log('=====================================');
    
    const results = [];
    for (const symbol of testSymbols) {
        const data = await fetchPreMarketData(symbol);
        if (data) {
            results.push(data);
        }
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Sort by pre-market volume
    results.sort((a, b) => b.premarketVolume - a.premarketVolume);
    
    console.log('\n\n📊 Pre-Market Volume Leaders:');
    console.log('=====================================');
    results.forEach((stock, idx) => {
        console.log(`${idx + 1}. ${stock.symbol}: ${stock.premarketVolume.toLocaleString()} shares (${stock.premarketChangePercent.toFixed(2)}%)`);
    });
}

// Also test the snapshot endpoint to compare
async function compareWithSnapshot() {
    console.log('\n\n🔍 Comparing with Snapshot Data...');
    console.log('=====================================');
    
    const symbol = 'TSLA';
    const snapshotUrl = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
    
    try {
        const response = await axios.get(snapshotUrl);
        const ticker = response.data?.ticker;
        
        if (ticker) {
            console.log(`\n${symbol} Snapshot Data:`);
            console.log(`  min.v (minute volume): ${ticker.min?.v || 0}`);
            console.log(`  min.av (accumulated volume): ${ticker.min?.av || 0}`);
            console.log(`  day.v (day volume): ${ticker.day?.v || 0}`);
            console.log(`  prevDay.v (previous day volume): ${ticker.prevDay?.v || 0}`);
            console.log(`\n⚠️  Note: min.av includes ALL volume from market open, not just pre-market!`);
        }
    } catch (error) {
        console.error('Error fetching snapshot:', error.message);
    }
}

// Run tests
async function runTests() {
    await testPreMarketData();
    await compareWithSnapshot();
}

runTests();