const axios = require('axios');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

async function checkAllHaltFields(symbol) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Checking ALL possible halt indicators for ${symbol}`);
    console.log('='.repeat(60));

    try {
        // 1. Check ticker details endpoint for halt information
        console.log('\n1️⃣ TICKER DETAILS:');
        try {
            const detailsUrl = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
            const details = await axios.get(detailsUrl);
            console.log('Market:', details.data.results?.market);
            console.log('Active:', details.data.results?.active);
            console.log('Type:', details.data.results?.type);
            console.log('Delisted UTC:', details.data.results?.delisted_utc);
        } catch (e) {
            console.log('Error fetching details:', e.message);
        }

        // 2. Check snapshot with all fields
        console.log('\n2️⃣ SNAPSHOT DATA:');
        const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const snapshot = await axios.get(snapshotUrl);
        const ticker = snapshot.data.ticker;

        console.log('Symbol:', ticker.ticker);
        console.log('Market Status:', snapshot.data.status);
        console.log('Updated (ns):', ticker.updated);
        // Convert nanoseconds to milliseconds for date
        const updatedMs = ticker.updated ? ticker.updated / 1000000 : 0;
        console.log('Last Update:', new Date(updatedMs).toISOString());

        // Check for market status indicator
        if (ticker.marketStatus) {
            console.log('Market Status Field:', ticker.marketStatus);
        }

        // Check for halt indicator
        if (ticker.halted !== undefined) {
            console.log('Halted Field:', ticker.halted);
        }

        // Check for suspended indicator
        if (ticker.suspended !== undefined) {
            console.log('Suspended Field:', ticker.suspended);
        }

        // 3. Check aggregates (bars) endpoint for gaps
        console.log('\n3️⃣ AGGREGATES (1-minute bars):');
        const now = Date.now();
        const from = now - (60 * 60 * 1000); // 1 hour ago
        const aggregatesUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${from}/${now}?apiKey=${POLYGON_API_KEY}`;
        const aggregates = await axios.get(aggregatesUrl);

        if (aggregates.data.results && aggregates.data.results.length > 0) {
            const bars = aggregates.data.results;
            console.log('Total bars in last hour:', bars.length);

            // Check for gaps in trading (halt indicator)
            let maxGap = 0;
            for (let i = 1; i < bars.length; i++) {
                const gap = (bars[i].t - bars[i-1].t) / 60000; // gap in minutes
                if (gap > maxGap) maxGap = gap;
            }
            console.log('Max gap between bars (minutes):', maxGap);

            // Last bar
            const lastBar = bars[bars.length - 1];
            const minsSinceLastBar = (now - lastBar.t) / 60000;
            console.log('Minutes since last bar:', minsSinceLastBar.toFixed(1));
            console.log('Last bar time:', new Date(lastBar.t).toISOString());
        } else {
            console.log('NO BARS DATA - Stock may be halted/suspended');
        }

        // 4. Check quotes endpoint for NBBO and indicators
        console.log('\n4️⃣ NBBO QUOTES:');
        const quoteUrl = `https://api.polygon.io/v3/quotes/${symbol}?order=desc&limit=5&apiKey=${POLYGON_API_KEY}`;
        const quotes = await axios.get(quoteUrl);

        if (quotes.data.results && quotes.data.results.length > 0) {
            const lastQuote = quotes.data.results[0];

            // Check for indicators array (may contain halt codes)
            if (lastQuote.indicators && lastQuote.indicators.length > 0) {
                console.log('⚠️ Quote Indicators:', lastQuote.indicators);

                // Decode indicators
                lastQuote.indicators.forEach(indicator => {
                    // Common halt indicators:
                    // 4 = Trading Halt
                    // 5 = Trading Resume
                    // 11 = Order Imbalance
                    // 12 = LULD Trading Pause
                    if (indicator === 4) console.log('  → TRADING HALT (Code 4)');
                    if (indicator === 5) console.log('  → TRADING RESUME (Code 5)');
                    if (indicator === 11) console.log('  → ORDER IMBALANCE (Code 11)');
                    if (indicator === 12) console.log('  → LULD PAUSE (Code 12)');
                });
            } else {
                console.log('No special indicators in quotes');
            }

            // Check for zero bid/ask (suspension indicator)
            if (lastQuote.bid_price === 0 || lastQuote.ask_price === 0) {
                console.log('⚠️ ZERO BID/ASK - May be suspended');
            }

            // Check conditions array
            if (lastQuote.conditions && lastQuote.conditions.length > 0) {
                console.log('Quote Conditions:', lastQuote.conditions);

                // Decode common conditions
                lastQuote.conditions.forEach(condition => {
                    // Common halt-related conditions
                    if (condition === 4) console.log('  → Halt condition');
                    if (condition === 29) console.log('  → Closed Market Maker');
                    if (condition === 41) console.log('  → Halted on Primary Market');
                });
            }

            const quoteTime = lastQuote.participant_timestamp / 1000000;
            console.log('Last quote time:', new Date(quoteTime).toISOString());
            console.log('Minutes since quote:', ((now - quoteTime) / 60000).toFixed(1));
        }

        // 5. Check trades for halt patterns
        console.log('\n5️⃣ TRADES DATA:');
        const tradesUrl = `https://api.polygon.io/v3/trades/${symbol}?order=desc&limit=10&apiKey=${POLYGON_API_KEY}`;
        const trades = await axios.get(tradesUrl);

        if (trades.data.results && trades.data.results.length > 0) {
            const lastTrade = trades.data.results[0];

            // Check for trade conditions
            if (lastTrade.conditions && lastTrade.conditions.length > 0) {
                console.log('Trade Conditions:', lastTrade.conditions);

                // Decode trade conditions
                lastTrade.conditions.forEach(condition => {
                    // Important halt-related conditions:
                    if (condition === 4) console.log('  → HALT TRADE');
                    if (condition === 11) console.log('  → DELAYED TRADE');
                    if (condition === 37) console.log('  → HALTED TRADE');
                    if (condition === 41) console.log('  → TRADING HALTED');
                });
            }

            const tradeTime = lastTrade.participant_timestamp / 1000000;
            console.log('Last trade time:', new Date(tradeTime).toISOString());
            console.log('Minutes since trade:', ((now - tradeTime) / 60000).toFixed(1));
        } else {
            console.log('NO TRADES - Stock may be suspended');
        }

        // FINAL DETERMINATION
        console.log('\n' + '='.repeat(60));
        console.log('📊 HALT STATUS DETERMINATION:');

        // Analyze all data points
        const hasRecentTrades = trades.data.results?.length > 0 &&
            ((now - (trades.data.results[0].participant_timestamp / 1000000)) / 60000) < 15;
        const hasRecentQuotes = quotes.data.results?.length > 0 &&
            ((now - (quotes.data.results[0].participant_timestamp / 1000000)) / 60000) < 15;
        const hasHaltIndicators = quotes.data.results?.[0]?.indicators?.includes(4) ||
                                 quotes.data.results?.[0]?.indicators?.includes(12);
        const hasHaltConditions = trades.data.results?.[0]?.conditions?.includes(4) ||
                                  trades.data.results?.[0]?.conditions?.includes(37) ||
                                  trades.data.results?.[0]?.conditions?.includes(41);

        if (hasHaltIndicators || hasHaltConditions) {
            console.log('⛔ HALTED - Halt indicators/conditions present');
            return 'HALTED';
        } else if (!hasRecentTrades && !hasRecentQuotes) {
            console.log('🚫 SUSPENDED - No recent trades or quotes');
            return 'SUSPENDED';
        } else if (!hasRecentTrades) {
            console.log('⚠️ INACTIVE - No recent trades (but has quotes)');
            return 'INACTIVE';
        } else {
            console.log('✅ ACTIVE - Normal trading');
            return 'ACTIVE';
        }

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
        return 'ERROR';
    }
}

async function main() {
    // Test with known stocks
    const testSymbols = ['BQ', 'WOLF', 'AAPL'];

    for (const symbol of testSymbols) {
        const status = await checkAllHaltFields(symbol);
        console.log(`\n🎯 ${symbol} Final Status: ${status}\n`);
    }
}

main();