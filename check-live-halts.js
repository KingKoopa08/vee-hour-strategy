const axios = require('axios');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function checkRealHaltStatus(symbol) {
    console.log(`\n🔍 Checking ${symbol}...`);

    try {
        // Get the latest trades to see if it's actively trading
        const tradesUrl = `https://api.polygon.io/v3/trades/${symbol}?order=desc&limit=10&apiKey=${POLYGON_API_KEY}`;
        const tradesResponse = await axios.get(tradesUrl);

        let isHalted = false;
        let status = 'ACTIVE';

        if (tradesResponse.data.results && tradesResponse.data.results.length > 0) {
            // Get the most recent trade
            const lastTrade = tradesResponse.data.results[0];
            const lastTradeTime = lastTrade.participant_timestamp / 1000000; // Convert from nanoseconds to ms
            const minutesSinceLastTrade = (Date.now() - lastTradeTime) / 60000;

            console.log(`Last trade: ${minutesSinceLastTrade.toFixed(1)} minutes ago at $${lastTrade.price}`);
            console.log(`Trade time: ${new Date(lastTradeTime).toLocaleTimeString()}`);

            // During market hours, if no trades for 10+ minutes, likely halted
            const now = new Date();
            const hours = now.getHours();
            const isMarketHours = hours >= 9 && hours < 16; // Simple check for EST market hours

            if (isMarketHours && minutesSinceLastTrade > 10) {
                status = 'HALTED';
                console.log('⛔ HALTED - No trades for 10+ minutes during market hours');
            } else if (minutesSinceLastTrade > 60) {
                status = 'INACTIVE';
                console.log('💤 INACTIVE - No trades for over an hour');
            } else {
                console.log('✓ ACTIVELY TRADING');
            }

            // Show recent trade activity
            console.log('\nRecent trades:');
            tradesResponse.data.results.slice(0, 5).forEach((trade, i) => {
                const tradeTime = trade.participant_timestamp / 1000000;
                const timeAgo = ((Date.now() - tradeTime) / 60000).toFixed(1);
                console.log(`  ${i+1}. $${trade.price} - ${timeAgo} min ago`);
            });

        } else {
            console.log('❌ NO TRADES DATA - Stock may be suspended or delisted');
            status = 'SUSPENDED';
        }

        // Also check the snapshot for additional confirmation
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const snapshot = await axios.get(snapshotUrl);

        if (snapshot.data.ticker) {
            const ticker = snapshot.data.ticker;
            const dayVolume = ticker.day?.v || 0;

            console.log(`\nDay Volume: ${dayVolume.toLocaleString()}`);
            console.log(`Day Range: $${ticker.day?.l || 0} - $${ticker.day?.h || 0}`);

            // Check for T12 halt pattern (all prices the same)
            if (ticker.day?.h === ticker.day?.l && ticker.day?.h === ticker.day?.c && dayVolume > 0) {
                console.log('⛔ T12 HALT PATTERN - All prices identical');
                status = 'HALTED';
            }
        }

        return status;

    } catch (error) {
        console.error('Error checking status:', error.response?.data || error.message);
        return 'UNKNOWN';
    }
}

async function main() {
    // Test stocks
    const testSymbols = ['BQ', 'WOLF', 'AAPL', 'NVDA'];

    console.log('=' .repeat(60));
    console.log('REAL-TIME HALT STATUS CHECK');
    console.log('=' .repeat(60));

    for (const symbol of testSymbols) {
        const status = await checkRealHaltStatus(symbol);
        console.log(`\n📊 ${symbol}: ${status}`);
        console.log('-'.repeat(40));
    }
}

main();