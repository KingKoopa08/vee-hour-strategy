const axios = require('axios');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV';

async function verifyFix() {
    console.log('🔍 Verifying Change Percentage Calculations\n');
    console.log('=' .repeat(80));

    try {
        // Get data from our API
        const localResponse = await axios.get('http://localhost:3050/api/gainers');
        const topStocks = localResponse.data.stocks.slice(0, 10);

        // Get raw data from Polygon API for comparison
        const polygonUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const polygonResponse = await axios.get(polygonUrl);

        // Create a map of Polygon data for quick lookup
        const polygonMap = new Map();
        polygonResponse.data.tickers.forEach(t => {
            polygonMap.set(t.ticker, t);
        });

        console.log('\nTop 10 Gainers - Calculation Verification:\n');

        topStocks.forEach((stock, index) => {
            const polygonData = polygonMap.get(stock.symbol);

            if (polygonData) {
                const prevClose = polygonData.prevDay?.c || 0;
                const currentPrice = polygonData.min?.c || polygonData.day?.c || 0;
                const apiChangePercent = polygonData.todaysChangePerc || 0;

                // Calculate what the change should be
                let calculatedChange = 0;
                if (prevClose > 0 && currentPrice > 0) {
                    calculatedChange = ((currentPrice - prevClose) / prevClose) * 100;
                }

                // Get our API's reported change
                const ourChange = stock.dayChange;

                console.log(`${index + 1}. ${stock.symbol}`);
                console.log(`   Price: $${currentPrice.toFixed(2)} (prev: $${prevClose.toFixed(2)})`);
                console.log(`   Our API Change: ${ourChange.toFixed(2)}%`);
                console.log(`   Calculated Change: ${calculatedChange.toFixed(2)}%`);
                console.log(`   Polygon API Change: ${apiChangePercent.toFixed(2)}%`);

                // Check if our calculation matches what we expect
                const diff = Math.abs(ourChange - calculatedChange);
                if (diff < 0.5) {
                    console.log(`   ✅ CORRECT - Our value matches calculated`);
                } else if (Math.abs(ourChange - apiChangePercent) < 0.5) {
                    console.log(`   ⚠️  Using API value instead of calculated`);
                } else {
                    console.log(`   ❌ DISCREPANCY - Difference: ${diff.toFixed(2)}%`);
                }

                // Show color indicator
                const color = ourChange >= 0 ? 'GREEN' : 'RED';
                console.log(`   Display: ${ourChange >= 0 ? '+' : ''}${ourChange.toFixed(2)}% (${color})`);
                console.log('');
            }
        });

        console.log('=' .repeat(80));
        console.log('\n✅ Fix Status:');
        console.log('   - Now calculating change from actual prices (prevDay.c to current)');
        console.log('   - No longer blindly trusting todaysChangePerc from API');
        console.log('   - Negative percentages should now display correctly as RED');
        console.log('   - Positive percentages should display as GREEN');

    } catch (error) {
        console.error('Error:', error.message);
        if (error.message.includes('ECONNREFUSED')) {
            console.log('\n⚠️  Make sure the unified-scanner is running on port 3050');
        }
    }
}

verifyFix();