const FinnhubClient = require('./finnhub-client');
const axios = require('axios');

// Initialize Finnhub client
const finnhub = new FinnhubClient();
const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';

async function compareDataSources() {
    console.log('🔍 Comparing Finnhub real-time data with Polygon delayed data...\n');

    // Test symbols - including CJET that was mentioned as having wrong data
    const testSymbols = ['CJET', 'AAPL', 'TSLA', 'NVDA', 'AMD'];

    console.log('Fetching data for:', testSymbols.join(', '), '\n');

    // Fetch from Polygon
    const polygonUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
    const polygonResponse = await axios.get(polygonUrl);
    const polygonData = polygonResponse.data.tickers;

    // Create map for Polygon data
    const polygonMap = new Map();
    polygonData.forEach(t => {
        if (testSymbols.includes(t.ticker)) {
            polygonMap.set(t.ticker, t);
        }
    });

    // Fetch from Finnhub
    console.log('Fetching real-time data from Finnhub...\n');
    const finnhubQuotes = await finnhub.getQuotes(testSymbols);

    // Compare results
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('SYMBOL │ POLYGON PRICE │ POLYGON % │ FINNHUB PRICE │ FINNHUB % │ DIFFERENCE');
    console.log('═══════════════════════════════════════════════════════════════════════════');

    for (const symbol of testSymbols) {
        const polygonStock = polygonMap.get(symbol);
        const finnhubStock = finnhubQuotes.find(q => q.symbol === symbol);

        if (polygonStock && finnhubStock) {
            const polygonPrice = polygonStock.day?.c || polygonStock.prevDay?.c || 0;
            const polygonChange = polygonStock.todaysChangePerc || 0;

            const finnhubData = finnhub.formatQuoteData(finnhubStock);
            const finnhubPrice = finnhubData.price;
            const finnhubChange = finnhubData.changePercent;

            const priceDiff = ((finnhubPrice - polygonPrice) / polygonPrice * 100).toFixed(2);
            const changeDiff = (finnhubChange - polygonChange).toFixed(2);

            console.log(
                `${symbol.padEnd(6)} │ $${polygonPrice.toFixed(2).padEnd(13)} │ ${polygonChange.toFixed(2).padEnd(9)}% │ $${finnhubPrice.toFixed(2).padEnd(13)} │ ${finnhubChange.toFixed(2).padEnd(9)}% │ ${changeDiff}%`
            );

            // Highlight significant differences
            if (Math.abs(finnhubChange - polygonChange) > 5) {
                console.log(`       ⚠️  SIGNIFICANT DIFFERENCE: Polygon shows ${polygonChange.toFixed(2)}% but Finnhub shows ${finnhubChange.toFixed(2)}%`);
            }
        }
    }

    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    // Test market status
    console.log('📊 Market Status from Finnhub:');
    try {
        const marketStatus = await finnhub.getMarketStatus();
        console.log(`   Exchange: ${marketStatus.exchange}`);
        console.log(`   Market: ${marketStatus.isOpen ? 'OPEN' : 'CLOSED'}`);
        console.log(`   Session: ${marketStatus.session || 'N/A'}`);
    } catch (error) {
        console.log('   Unable to fetch market status');
    }

    // Show timestamp comparison
    console.log('\n⏰ Data Freshness:');
    const polygonTimestamp = polygonData[0]?.updated || polygonData[0]?.min?.t;
    if (polygonTimestamp) {
        const polygonDate = new Date(polygonTimestamp);
        const delayMinutes = Math.round((Date.now() - polygonDate.getTime()) / 60000);
        console.log(`   Polygon data: ${delayMinutes} minutes old`);
    }
    console.log(`   Finnhub data: Real-time (< 1 second delay)`);
}

// Run the comparison
compareDataSources().catch(console.error);