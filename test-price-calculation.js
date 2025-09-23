const axios = require('axios');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV';

async function testCalculations() {
    console.log('🔍 Testing Price Change Calculations\n');
    console.log('=' .repeat(80));

    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&tickers.any_of=IBG,SLE,GLTO,IPDN,PLUG`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            response.data.tickers.forEach(ticker => {
                console.log(`\n📊 ${ticker.ticker}`);
                console.log('-'.repeat(40));

                // Extract all prices
                const prevClose = ticker.prevDay?.c || 0;
                const dayClose = ticker.day?.c || 0;
                const minClose = ticker.min?.c || 0;
                const apiChangePercent = ticker.todaysChangePerc || 0;
                const apiChangeValue = ticker.todaysChange || 0;

                console.log(`Previous Close: $${prevClose.toFixed(2)}`);
                console.log(`Day Close: $${dayClose.toFixed(2)}`);
                console.log(`Latest (min.c): $${minClose.toFixed(2)}`);
                console.log(`API Change %: ${apiChangePercent.toFixed(2)}%`);
                console.log(`API Change $: $${apiChangeValue.toFixed(2)}`);

                // Calculate the actual change
                let currentPrice = minClose || dayClose || prevClose;
                let calculatedChange = 0;
                let calculatedChangeValue = 0;

                if (prevClose > 0 && currentPrice > 0) {
                    calculatedChangeValue = currentPrice - prevClose;
                    calculatedChange = (calculatedChangeValue / prevClose) * 100;
                }

                console.log(`\n✅ CALCULATED:`);
                console.log(`Current Price: $${currentPrice.toFixed(2)}`);
                console.log(`Change $: $${calculatedChangeValue.toFixed(2)}`);
                console.log(`Change %: ${calculatedChange.toFixed(2)}%`);

                // Check for discrepancy
                const discrepancy = Math.abs(apiChangePercent - calculatedChange);
                if (discrepancy > 5) {
                    console.log(`\n⚠️  DISCREPANCY: ${discrepancy.toFixed(2)}% difference!`);
                    console.log(`API says: ${apiChangePercent.toFixed(2)}%`);
                    console.log(`Calculated: ${calculatedChange.toFixed(2)}%`);
                    console.log(`Should use CALCULATED value!`);
                } else {
                    console.log(`\n✅ Values match (within 5%)`);
                }

                // Show what the correct display should be
                console.log(`\n📋 CORRECT DISPLAY:`);
                console.log(`Price: $${currentPrice.toFixed(2)}`);
                console.log(`Change: ${calculatedChange >= 0 ? '+' : ''}${calculatedChange.toFixed(2)}%`);
                console.log(`Color: ${calculatedChange >= 0 ? 'GREEN' : 'RED'}`);
            });
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n💡 SOLUTION: Always calculate change from prevDay.c to current price');
        console.log('   Don\'t trust todaysChangePerc from API if it doesn\'t match calculated value');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testCalculations();