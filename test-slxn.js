// require('dotenv').config();
const axios = require('axios');

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'lY3CvltO1hyrC5DqUWCEkTpLlhb0UGsb';

async function testSLXN() {
    try {
        // Get SLXN ticker data
        const tickerUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/SLXN?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(tickerUrl);
        
        const ticker = response.data.ticker;
        console.log('\n=== SLXN Data from Polygon ===');
        console.log('Symbol:', ticker.ticker);
        console.log('Today\'s Change %:', ticker.todaysChangePerc, '%');
        console.log('Today\'s Change $:', ticker.todaysChange);
        console.log('\nDay data:', ticker.day);
        console.log('Min data:', ticker.min);
        console.log('PrevDay data:', ticker.prevDay);
        
        // Calculate volumes
        const dayVolume = ticker.day?.v || 0;
        const minVolume = ticker.min?.v || 0;
        const minAvgVolume = ticker.min?.av || 0;
        const prevDayVolume = ticker.prevDay?.v || 0;
        
        console.log('\n=== Volume Analysis ===');
        console.log('Day Volume (day.v):', dayVolume);
        console.log('Min Volume (min.v):', minVolume);
        console.log('Min Avg Volume (min.av):', minAvgVolume);
        console.log('Previous Day Volume:', prevDayVolume);
        
        console.log('\n=== What we should use ===');
        const preMarketVolume = minAvgVolume || minVolume || dayVolume || prevDayVolume || 0;
        console.log('Pre-market volume to use:', preMarketVolume);
        
        // Check most active
        const activeUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers.any_of=SLXN&apiKey=${POLYGON_API_KEY}`;
        const activeResponse = await axios.get(activeUrl);
        if (activeResponse.data.tickers?.length > 0) {
            console.log('\n=== In active list? ===');
            console.log('Found in active tickers');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testSLXN();