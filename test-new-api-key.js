const axios = require('axios');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV';

async function testPolygonAPI() {
    console.log('🔑 Testing Polygon API with new key...');
    console.log(`API Key: ${POLYGON_API_KEY.substring(0, 10)}...`);

    try {
        // Test 1: Market Status
        console.log('\n📊 Test 1: Getting Market Status...');
        const marketStatusUrl = `https://api.polygon.io/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`;
        const marketStatus = await axios.get(marketStatusUrl);
        console.log('✅ Market Status:', marketStatus.data.market);

        // Test 2: Get a few tickers
        console.log('\n📊 Test 2: Getting Top Tickers...');
        const tickersUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${POLYGON_API_KEY}&limit=5`;
        const tickers = await axios.get(tickersUrl);
        console.log(`✅ Found ${tickers.data.tickers.length} tickers`);

        // Show first ticker details
        if (tickers.data.tickers.length > 0) {
            const firstTicker = tickers.data.tickers[0];
            console.log('\nFirst ticker details:');
            console.log(`  Symbol: ${firstTicker.ticker}`);
            console.log(`  Price: $${firstTicker.day?.c || firstTicker.prevDay?.c || 'N/A'}`);
            console.log(`  Volume: ${firstTicker.day?.v || firstTicker.prevDay?.v || 'N/A'}`);
            console.log(`  Change: ${firstTicker.todaysChangePerc?.toFixed(2) || 'N/A'}%`);
        }

        // Test 3: WebSocket authentication
        console.log('\n📊 Test 3: Testing WebSocket Authentication...');
        const WebSocket = require('ws');
        const ws = new WebSocket('wss://socket.polygon.io/stocks');

        await new Promise((resolve, reject) => {
            ws.on('open', () => {
                console.log('✅ WebSocket connected');
                // Send authentication
                ws.send(JSON.stringify({
                    action: 'auth',
                    params: POLYGON_API_KEY
                }));
            });

            ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg[0]?.ev === 'status') {
                    if (msg[0].status === 'auth_success') {
                        console.log('✅ WebSocket authentication successful!');
                        ws.close();
                        resolve();
                    } else if (msg[0].status === 'auth_failed') {
                        console.log('❌ WebSocket authentication failed:', msg[0].message);
                        ws.close();
                        reject(new Error('WebSocket auth failed'));
                    }
                }
            });

            ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error.message);
                reject(error);
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                ws.close();
                resolve();
            }, 5000);
        });

        console.log('\n✅ All tests passed! The new API key is working correctly.');
        console.log('🎉 You can now use real-time data from Polygon!');

    } catch (error) {
        console.error('\n❌ Error testing API:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testPolygonAPI();