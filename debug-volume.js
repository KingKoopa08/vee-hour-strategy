const axios = require('axios');

const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const POLYGON_BASE_URL = 'https://api.polygon.io';

async function debugVolume() {
    try {
        console.log('🔍 Fetching snapshot data to debug volume...\n');
        
        // Get snapshot for known high-volume pre-market stocks
        const testSymbols = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL'];
        
        for (const symbol of testSymbols) {
            const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
            const response = await axios.get(url);
            const ticker = response.data?.ticker;
            
            if (ticker) {
                console.log(`\n📊 ${symbol} Data Structure:`);
                console.log('=====================================');
                
                // Show all available data fields
                console.log('\n📈 Day Bar (t.day):');
                console.log(`  Open: ${ticker.day?.o || 'N/A'}`);
                console.log(`  Close: ${ticker.day?.c || 'N/A'}`);
                console.log(`  Volume: ${ticker.day?.v || 'N/A'}`);
                console.log(`  VWAP: ${ticker.day?.vw || 'N/A'}`);
                
                console.log('\n📊 Minute Bar (t.min):');
                console.log(`  Open: ${ticker.min?.o || 'N/A'}`);
                console.log(`  Close: ${ticker.min?.c || 'N/A'}`);
                console.log(`  Volume: ${ticker.min?.v || 'N/A'}`);
                console.log(`  Accumulated Volume: ${ticker.min?.av || 'N/A'}`);
                console.log(`  VWAP: ${ticker.min?.vw || 'N/A'}`);
                console.log(`  Timestamp: ${ticker.min?.t ? new Date(ticker.min.t).toLocaleString() : 'N/A'}`);
                
                console.log('\n📅 Previous Day (t.prevDay):');
                console.log(`  Close: ${ticker.prevDay?.c || 'N/A'}`);
                console.log(`  Volume: ${ticker.prevDay?.v || 'N/A'}`);
                
                console.log('\n🔄 Today\'s Data:');
                console.log(`  Today's Change: ${ticker.todaysChange || 'N/A'}`);
                console.log(`  Today's Change %: ${ticker.todaysChangePerc || 'N/A'}`);
                
                // Check for pre-market specific fields
                console.log('\n🌅 Pre-Market (if available):');
                console.log(`  Premarket field: ${JSON.stringify(ticker.premarket) || 'Not found'}`);
                console.log(`  Updated: ${ticker.updated ? new Date(ticker.updated).toLocaleString() : 'N/A'}`);
                
                // Show raw ticker object
                console.log('\n📋 Raw ticker object keys:', Object.keys(ticker));
            }
        }
        
        // Now get the full snapshot to see volume sorting
        console.log('\n\n🔍 Getting full market snapshot...');
        const fullUrl = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&order=desc&sort=volume&limit=10`;
        const fullResponse = await axios.get(fullUrl);
        
        if (fullResponse.data?.tickers) {
            console.log('\nTop 10 stocks by volume (according to API):');
            console.log('==========================================');
            fullResponse.data.tickers.forEach((t, idx) => {
                const dayVol = t.day?.v || 0;
                const minVol = t.min?.v || 0;
                const minAccVol = t.min?.av || 0;
                console.log(`${idx + 1}. ${t.ticker}: Day Vol=${dayVol}, Min Vol=${minVol}, Min Acc Vol=${minAccVol}`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

debugVolume();