const axios = require('axios');

const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Function to get today's date in YYYY-MM-DD format
function getTodayDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

// Fetch true pre-market data for a stock using aggregates
async function fetchPreMarketVolume(symbol) {
    try {
        const today = getTodayDate();
        const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/1/minute/${today}/${today}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        
        const response = await axios.get(url, { timeout: 5000 });
        
        if (response.data && response.data.results) {
            const bars = response.data.results;
            
            // Filter for pre-market hours (4:00 AM to 9:30 AM ET)
            const premarketBars = bars.filter(bar => {
                const date = new Date(bar.t);
                const hour = date.getUTCHours() - 5; // Convert to ET (UTC-5)
                const minute = date.getMinutes();
                const totalMinutes = hour * 60 + minute;
                
                // Pre-market: 4:00 AM (240 minutes) to 9:30 AM (570 minutes)
                return totalMinutes >= 240 && totalMinutes < 570;
            });
            
            if (premarketBars.length > 0) {
                // Calculate pre-market volume
                const premarketVolume = premarketBars.reduce((sum, bar) => sum + (bar.v || 0), 0);
                
                // Get first and last pre-market prices
                const firstBar = premarketBars[0];
                const lastBar = premarketBars[premarketBars.length - 1];
                
                return {
                    symbol,
                    premarketVolume,
                    premarketChange: ((lastBar.c - firstBar.o) / firstBar.o * 100),
                    premarketBars: premarketBars.length
                };
            }
        }
        return null;
    } catch (error) {
        // Silently fail for individual stocks
        return null;
    }
}

// Get list of most active stocks from snapshot
async function getMostActiveStocks() {
    try {
        console.log('🔍 Fetching most active stocks from market snapshot...');
        
        // Get snapshot of all US stocks sorted by volume
        const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=100`;
        const response = await axios.get(url);
        
        if (response.data && response.data.tickers) {
            const symbols = response.data.tickers.map(t => t.ticker);
            console.log(`📊 Found ${symbols.length} active stocks to check`);
            return symbols;
        }
        return [];
    } catch (error) {
        console.error('Error fetching active stocks:', error.message);
        return [];
    }
}

// Main function to find pre-market leaders
async function findPreMarketLeaders() {
    console.log('🚀 Finding Pre-Market Volume Leaders...');
    console.log(`📅 Date: ${getTodayDate()}`);
    console.log('=====================================\n');
    
    // Get list of active stocks
    const activeStocks = await getMostActiveStocks();
    
    if (activeStocks.length === 0) {
        console.log('❌ No active stocks found');
        return;
    }
    
    console.log('⏳ Checking pre-market volumes (this may take a minute)...\n');
    
    const results = [];
    let checked = 0;
    
    // Process stocks in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < activeStocks.length; i += batchSize) {
        const batch = activeStocks.slice(i, i + batchSize);
        const batchPromises = batch.map(symbol => fetchPreMarketVolume(symbol));
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(result => {
            if (result && result.premarketVolume > 100000) { // Only include stocks with >100k pre-market volume
                results.push(result);
                console.log(`✅ ${result.symbol}: ${result.premarketVolume.toLocaleString()} shares (${result.premarketChange.toFixed(2)}%)`);
            }
        });
        
        checked += batch.length;
        if (checked % 20 === 0) {
            console.log(`   ... checked ${checked}/${activeStocks.length} stocks`);
        }
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Sort by pre-market volume
    results.sort((a, b) => b.premarketVolume - a.premarketVolume);
    
    console.log('\n\n🏆 TOP PRE-MARKET VOLUME LEADERS:');
    console.log('=====================================');
    
    if (results.length === 0) {
        console.log('❌ No stocks found with significant pre-market volume');
        console.log('   This might be because:');
        console.log('   1. Market is not in pre-market hours');
        console.log('   2. It\'s a weekend or holiday');
        console.log('   3. Pre-market trading hasn\'t started yet');
    } else {
        results.slice(0, 20).forEach((stock, idx) => {
            console.log(`${idx + 1}. ${stock.symbol}: ${stock.premarketVolume.toLocaleString()} shares (${stock.premarketChange.toFixed(2)}%)`);
        });
        
        console.log('\n📊 Summary:');
        console.log(`   Total stocks with >100k pre-market volume: ${results.length}`);
        console.log(`   Highest volume: ${results[0].symbol} with ${results[0].premarketVolume.toLocaleString()} shares`);
        
        // Save results to file for server to use
        const fs = require('fs');
        fs.writeFileSync('premarket-leaders.json', JSON.stringify(results, null, 2));
        console.log('\n💾 Results saved to premarket-leaders.json');
    }
}

// Run the script
findPreMarketLeaders().catch(console.error);