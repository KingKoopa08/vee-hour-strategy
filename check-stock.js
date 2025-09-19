require('dotenv').config();
const axios = require('axios');

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function checkStock(ticker) {
    console.log(`\n📊 Checking stock: ${ticker}`);
    console.log('='.repeat(50));

    try {
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);

        if (response.data && response.data.tickers) {
            const stock = response.data.tickers.find(t => t.ticker === ticker);

            if (stock) {
                console.log('\n📈 Stock Data:');
                console.log(`Symbol: ${stock.ticker}`);
                console.log(`Current Price: $${stock.day?.c || stock.min?.c || 'N/A'}`);
                console.log(`Previous Close: $${stock.prevDay?.c || 'N/A'}`);
                console.log(`Today's Change %: ${stock.todaysChangePerc}%`);
                console.log(`Today's Change $: $${stock.todaysChange || 'N/A'}`);
                console.log(`Volume: ${(stock.day?.v || 0).toLocaleString()}`);
                console.log(`Day High: $${stock.day?.h || 'N/A'}`);
                console.log(`Day Low: $${stock.day?.l || 'N/A'}`);

                console.log('\n📊 Raw API Response for this ticker:');
                console.log(JSON.stringify(stock, null, 2));

                // Calculate what the actual change should be
                if (stock.day?.c && stock.prevDay?.c) {
                    const actualChangePercent = ((stock.day.c - stock.prevDay.c) / stock.prevDay.c) * 100;
                    console.log(`\n✅ Calculated Change %: ${actualChangePercent.toFixed(2)}%`);
                    console.log(`🔍 API Says: ${stock.todaysChangePerc}%`);

                    if (Math.abs(actualChangePercent - stock.todaysChangePerc) > 1) {
                        console.log(`\n⚠️  WARNING: Large discrepancy between calculated and API values!`);
                    }
                }
            } else {
                console.log(`Stock ${ticker} not found in snapshot`);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Check MHY specifically
checkStock('MHY');