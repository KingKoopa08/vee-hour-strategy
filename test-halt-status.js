const axios = require('axios');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function checkStockStatus(symbol) {
    console.log(`\n🔍 Checking ${symbol} status...`);

    try {
        // 1. Check snapshot endpoint (this is what we're using)
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const snapshot = await axios.get(snapshotUrl);

        console.log('\n📊 Snapshot Data:');
        const ticker = snapshot.data.ticker;
        console.log('Symbol:', ticker.ticker);
        console.log('Day Volume:', ticker.day?.v || 0);
        console.log('Day High:', ticker.day?.h);
        console.log('Day Low:', ticker.day?.l);
        console.log('Day Close:', ticker.day?.c);
        console.log('Day Open:', ticker.day?.o);
        console.log('Updated:', new Date(ticker.updated || 0).toISOString());
        console.log('Last Quote Time:', ticker.min?.t ? new Date(ticker.min.t).toISOString() : 'N/A');

        // 2. Check for halt/suspension indicators
        const hasVolume = (ticker.day?.v || 0) > 0;
        const hasQuote = ticker.min?.c !== undefined;
        const allPricesSame = ticker.day?.h === ticker.day?.l && ticker.day?.h === ticker.day?.c;
        const timeSinceUpdate = Date.now() - (ticker.updated || 0);

        console.log('\n🚨 Status Indicators:');
        console.log('Has Volume Today:', hasVolume);
        console.log('Has Recent Quote:', hasQuote);
        console.log('All Prices Same:', allPricesSame);
        console.log('Minutes Since Update:', Math.round(timeSinceUpdate / 60000));

        // 3. Check trades endpoint for recent activity
        const tradesUrl = `https://api.polygon.io/v3/trades/${symbol}?limit=5&apiKey=${POLYGON_API_KEY}`;
        const trades = await axios.get(tradesUrl);

        console.log('\n📈 Recent Trades:');
        if (trades.data.results && trades.data.results.length > 0) {
            const lastTrade = trades.data.results[0];
            const lastTradeTime = lastTrade.participant_timestamp / 1000000; // nanoseconds to ms
            console.log('Last Trade Time:', new Date(lastTradeTime).toISOString());
            console.log('Last Trade Price:', lastTrade.price);
            console.log('Minutes Since Last Trade:', Math.round((Date.now() - lastTradeTime) / 60000));
        } else {
            console.log('NO RECENT TRADES FOUND');
        }

        // 4. Check for specific quote details
        const quoteUrl = `https://api.polygon.io/v3/quotes/${symbol}?limit=1&apiKey=${POLYGON_API_KEY}`;
        const quotes = await axios.get(quoteUrl);

        console.log('\n💰 Latest Quote:');
        if (quotes.data.results && quotes.data.results.length > 0) {
            const lastQuote = quotes.data.results[0];
            console.log('Bid:', lastQuote.bid_price);
            console.log('Ask:', lastQuote.ask_price);
            console.log('Bid Size:', lastQuote.bid_size);
            console.log('Ask Size:', lastQuote.ask_size);
            const quoteTime = lastQuote.participant_timestamp / 1000000;
            console.log('Quote Time:', new Date(quoteTime).toISOString());
            console.log('Minutes Since Quote:', Math.round((Date.now() - quoteTime) / 60000));

            // Check for halt indicators in quote
            const indicators = lastQuote.indicators || [];
            console.log('Quote Indicators:', indicators);

            // Check exchange
            console.log('Exchange:', lastQuote.exchange);

            // Bid/Ask spread
            const spread = lastQuote.ask_price - lastQuote.bid_price;
            const spreadPercent = (spread / lastQuote.bid_price) * 100;
            console.log('Spread:', spread.toFixed(4), `(${spreadPercent.toFixed(2)}%)`);
        } else {
            console.log('NO QUOTES AVAILABLE');
        }

        // DETERMINE STATUS
        console.log('\n✅ LIKELY STATUS:');
        if (!hasVolume && !trades.data.results?.length) {
            console.log('🚫 SUSPENDED - No volume and no trades');
        } else if (allPricesSame && hasVolume) {
            console.log('⛔ HALTED - All prices same with volume');
        } else if (timeSinceUpdate > 15 * 60 * 1000) {
            console.log('⚠️ STALE DATA - No updates for 15+ minutes');
        } else {
            console.log('✓ ACTIVE - Normal trading');
        }

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Test with known suspended stocks
async function main() {
    // Test with BQ (you said it's suspended)
    await checkStockStatus('BQ');

    // Test with a normal stock for comparison
    console.log('\n' + '='.repeat(60));
    await checkStockStatus('AAPL');
}

main();