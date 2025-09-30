const axios = require('axios');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function testHaltDetection(symbol) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${symbol}`);
    console.log('='.repeat(60));

    try {
        // 1. Check market status for halted list
        console.log('\n1️⃣ Market Status Endpoint:');
        const marketUrl = `https://api.polygon.io/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`;
        const marketResponse = await axios.get(marketUrl);

        console.log('Market:', marketResponse.data.market);
        if (marketResponse.data.securities && marketResponse.data.securities.halted) {
            const haltedList = marketResponse.data.securities.halted || [];
            if (haltedList.includes(symbol)) {
                console.log(`✅ ${symbol} is in HALTED list!`);
            } else {
                console.log(`❌ ${symbol} is NOT in halted list`);
            }
            console.log('Total halted stocks:', haltedList.length);
            if (haltedList.length > 0 && haltedList.length < 10) {
                console.log('Halted tickers:', haltedList.join(', '));
            }
        } else {
            console.log('No halted securities list in response');
        }

        // 2. Check ticker details
        console.log('\n2️⃣ Ticker Details Endpoint:');
        const tickerUrl = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const tickerResponse = await axios.get(tickerUrl);

        if (tickerResponse.data.results) {
            const ticker = tickerResponse.data.results;
            console.log('Name:', ticker.name);
            console.log('Active:', ticker.active);
            console.log('Market:', ticker.market);
            console.log('Type:', ticker.type);

            if (ticker.delisted_utc) {
                console.log('⚠️ DELISTED:', ticker.delisted_utc);
            }

            if (ticker.active === false) {
                console.log('⚠️ Stock is INACTIVE (possibly suspended/delisted)');
            } else {
                console.log('✅ Stock is ACTIVE');
            }
        }

        // 3. Check recent trading activity
        console.log('\n3️⃣ Recent Trading Activity:');
        const tradesUrl = `https://api.polygon.io/v3/trades/${symbol}?order=desc&limit=1&apiKey=${POLYGON_API_KEY}`;
        const tradesResponse = await axios.get(tradesUrl);

        if (tradesResponse.data.results && tradesResponse.data.results.length > 0) {
            const lastTrade = tradesResponse.data.results[0];
            const tradeTime = lastTrade.participant_timestamp / 1000000;
            const minutesAgo = ((Date.now() - tradeTime) / 60000).toFixed(1);

            console.log('Last trade:', minutesAgo, 'minutes ago');
            console.log('Price: $' + lastTrade.price);
            console.log('Conditions:', lastTrade.conditions || []);

            if (minutesAgo > 15) {
                console.log('⚠️ No trades for over 15 minutes - might be halted');
            }
        } else {
            console.log('❌ No trades found');
        }

        // 4. Check day volume
        console.log('\n4️⃣ Day Volume Check:');
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const snapshotResponse = await axios.get(snapshotUrl);

        if (snapshotResponse.data.ticker) {
            const dayVolume = snapshotResponse.data.ticker.day?.v || 0;
            console.log('Day Volume:', dayVolume.toLocaleString());

            if (dayVolume === 0) {
                console.log('⚠️ Zero volume today - might be suspended');
            }
        }

        // Final determination
        console.log('\n📊 FINAL STATUS:');
        if (tickerResponse.data.results?.active === false) {
            console.log('🚫 SUSPENDED/INACTIVE');
        } else if (marketResponse.data.securities?.halted?.includes(symbol)) {
            console.log('⛔ HALTED (in market halt list)');
        } else if (tradesResponse.data.results?.[0]) {
            const minutesAgo = ((Date.now() - (tradesResponse.data.results[0].participant_timestamp / 1000000)) / 60000);
            if (minutesAgo > 15) {
                console.log('⚠️ POSSIBLY HALTED (no recent trades)');
            } else {
                console.log('✅ ACTIVE');
            }
        } else {
            console.log('❓ UNKNOWN');
        }

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

async function main() {
    console.log('Testing Polygon.io Halt Detection APIs');
    console.log('Current time:', new Date().toLocaleString());

    // Test various stocks
    await testHaltDetection('BQ');
    await testHaltDetection('YCBD');
    await testHaltDetection('WOLF');
    await testHaltDetection('AAPL');
}

main();