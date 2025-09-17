const axios = require('axios');
const WebSocket = require('ws');

const API_URL = 'http://localhost:3018';
const WS_URL = 'ws://localhost:3006';

console.log('🧪 MOMENTUM TRACKING TEST');
console.log('=========================\n');

// Test 1: Check rocket scan endpoint
async function testRocketScan() {
    console.log('📊 Test 1: Fetching rocket scan data...');
    try {
        const response = await axios.get(`${API_URL}/api/rockets/scan`);
        const data = response.data;

        if (data.success && data.rockets) {
            const { momentumLeaders, consolidating, pullbacks } = data.rockets;
            console.log(`✅ Rocket scan successful!`);
            console.log(`   - Momentum Leaders: ${momentumLeaders.length}`);
            console.log(`   - Consolidating: ${consolidating.length}`);
            console.log(`   - Pullbacks: ${pullbacks.length}`);

            // Show top momentum leader if exists
            if (momentumLeaders.length > 0) {
                const leader = momentumLeaders[0];
                console.log(`\n   Top Leader: ${leader.symbol}`);
                console.log(`   - Price: $${leader.price.toFixed(2)}`);
                console.log(`   - Day Change: ${leader.changePercent.toFixed(2)}%`);
                console.log(`   - 1m Momentum: ${leader.priceChange1m?.toFixed(2) || 'N/A'}%`);
                console.log(`   - 5m Momentum: ${leader.priceChange5m?.toFixed(2) || 'N/A'}%`);
            }
        } else {
            console.log('❌ No rocket data received');
        }
    } catch (error) {
        console.error('❌ Error fetching rockets:', error.message);
    }
}

// Test 2: Check momentum data for specific symbol
async function testMomentumData(symbol = 'SPY') {
    console.log(`\n📊 Test 2: Checking momentum data for ${symbol}...`);
    try {
        const response = await axios.get(`${API_URL}/api/debug/momentum/${symbol}`);
        const data = response.data;

        console.log(`✅ Momentum data for ${symbol}:`);
        console.log(`   - History points: ${data.historyLength}`);
        console.log(`   - 1m Change: ${data.momentum.priceChange1m.toFixed(2)}%`);
        console.log(`   - 5m Change: ${data.momentum.priceChange5m.toFixed(2)}%`);

        if (data.history.length > 0) {
            const latest = data.history[data.history.length - 1];
            console.log(`   - Latest price: $${latest.price.toFixed(2)} at ${new Date(latest.timestamp).toLocaleTimeString()}`);
        }
    } catch (error) {
        console.error('❌ Error fetching momentum:', error.message);
    }
}

// Test 3: WebSocket connection and real-time updates
async function testWebSocket() {
    console.log('\n📊 Test 3: Testing WebSocket connection...');

    return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);
        let messageCount = 0;
        const timeout = setTimeout(() => {
            console.log(`   Received ${messageCount} messages in 10 seconds`);
            ws.close();
            resolve();
        }, 10000);

        ws.on('open', () => {
            console.log('✅ WebSocket connected');
        });

        ws.on('message', (data) => {
            messageCount++;
            const message = JSON.parse(data);

            if (messageCount === 1) {
                console.log(`   First message type: ${message.type}`);
                if (message.type === 'priceUpdates' && message.data.length > 0) {
                    const sample = message.data[0];
                    console.log(`   Sample update: ${sample.symbol} - Price: $${sample.price.toFixed(2)}, 1m: ${sample.priceChange1m?.toFixed(2) || 'N/A'}%`);
                }
            }
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
            clearTimeout(timeout);
            resolve();
        });

        ws.on('close', () => {
            console.log('   WebSocket closed');
            clearTimeout(timeout);
            resolve();
        });
    });
}

// Test 4: Monitor momentum building over time
async function monitorMomentumBuildup(symbol = 'TSLA', duration = 30000) {
    console.log(`\n📊 Test 4: Monitoring ${symbol} momentum for ${duration/1000} seconds...`);

    const startTime = Date.now();
    const interval = setInterval(async () => {
        try {
            const response = await axios.get(`${API_URL}/api/debug/momentum/${symbol}`);
            const data = response.data;

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`   [${elapsed}s] History: ${data.historyLength} points | 1m: ${data.momentum.priceChange1m.toFixed(2)}% | 5m: ${data.momentum.priceChange5m.toFixed(2)}%`);

            if (Date.now() - startTime >= duration) {
                clearInterval(interval);
                console.log(`✅ Monitoring complete`);
            }
        } catch (error) {
            console.error('   Error:', error.message);
        }
    }, 5000);
}

// Run all tests
async function runTests() {
    try {
        await testRocketScan();
        await testMomentumData();
        await testWebSocket();
        await monitorMomentumBuildup('SPY', 20000); // Monitor for 20 seconds

        console.log('\n✅ ALL TESTS COMPLETE');
        console.log('=========================');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ TEST SUITE FAILED:', error);
        process.exit(1);
    }
}

// Start tests
console.log('Starting tests in 2 seconds...\n');
setTimeout(runTests, 2000);