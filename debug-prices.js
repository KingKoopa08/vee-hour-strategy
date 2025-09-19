require('dotenv').config();
const axios = require('axios');

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function debugPrices() {
    console.log('\n🔍 DEBUGGING PRICE DATA');
    console.log('='.repeat(50));

    // Get current time in ET
    const now = new Date();
    const etOffset = -5; // EST offset
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const et = new Date(utc + (3600000 * etOffset));
    console.log(`Current ET Time: ${et.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            // Get top 10 gainers
            const gainers = response.data.tickers
                .filter(t => t.ticker !== 'MHY') // Filter out bad data
                .filter(t => {
                    const dayChange = t.todaysChangePerc || 0;
                    return dayChange > 0;
                })
                .sort((a, b) => (b.todaysChangePerc || 0) - (a.todaysChangePerc || 0))
                .slice(0, 10);

            console.log('\n📊 TOP 10 GAINERS - PRICE ANALYSIS:');
            console.log('='.repeat(50));

            for (const stock of gainers) {
                console.log(`\n${stock.ticker}:`);
                console.log('  Raw Data from API:');
                console.log(`    day.c (Regular Close): $${stock.day?.c || 'N/A'}`);
                console.log(`    min.c (Latest Quote): $${stock.min?.c || 'N/A'}`);
                console.log(`    prevDay.c (Prev Close): $${stock.prevDay?.c || 'N/A'}`);
                console.log(`    day.o (Today Open): $${stock.day?.o || 'N/A'}`);
                console.log(`    day.h (Today High): $${stock.day?.h || 'N/A'}`);
                console.log(`    day.l (Today Low): $${stock.day?.l || 'N/A'}`);
                console.log(`    todaysChangePerc: ${stock.todaysChangePerc}%`);
                console.log(`    todaysChange: $${stock.todaysChange}`);

                // Calculate what we're displaying
                const displayPrice = stock.min?.c || stock.day?.c || stock.prevDay?.c || 0;
                console.log(`\n  📍 Display Price (min.c first): $${displayPrice}`);

                // Verify the percentage
                if (stock.prevDay?.c && displayPrice) {
                    const calculatedChange = ((displayPrice - stock.prevDay.c) / stock.prevDay.c) * 100;
                    console.log(`  ✅ Calculated Change: ${calculatedChange.toFixed(2)}%`);
                    console.log(`  🔍 API Says: ${stock.todaysChangePerc}%`);

                    if (Math.abs(calculatedChange - stock.todaysChangePerc) > 1) {
                        console.log(`  ⚠️  MISMATCH DETECTED!`);
                    }
                }

                // Check for after-hours data
                if (stock.min?.c && stock.day?.c) {
                    const afterHoursChange = ((stock.min.c - stock.day.c) / stock.day.c) * 100;
                    if (Math.abs(afterHoursChange) > 0.01) {
                        console.log(`  🌙 After-Hours Movement: ${afterHoursChange.toFixed(2)}%`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugPrices();