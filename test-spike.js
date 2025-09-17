const WebSocket = require('ws');

console.log('🧪 SPIKE DETECTION TEST');
console.log('========================\n');

const WS_URL = 'ws://localhost:3007';
const API_URL = 'http://localhost:3019';

// Connect to WebSocket
function testWebSocket() {
    console.log('📡 Connecting to spike server...');

    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
        console.log('✅ Connected to spike server\n');
        console.log('📊 Listening for spikes...\n');
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data);

        switch(message.type) {
            case 'init':
                console.log('📋 Initial state received:');
                console.log(`  - Active spikes: ${message.data.activeSpikes.length}`);
                console.log(`  - Completed spikes: ${message.data.completedSpikes.length}`);
                console.log(`  - Total detected: ${message.data.stats?.spikesDetected || 0}\n`);
                break;

            case 'spike':
                console.log('🚨 NEW SPIKE DETECTED!');
                const spike = message.data;
                console.log(`  Symbol: ${spike.symbol}`);
                console.log(`  Price: $${spike.startPrice.toFixed(2)} → $${spike.currentPrice.toFixed(2)}`);
                console.log(`  Change: +${spike.priceChange.toFixed(2)}%`);
                console.log(`  Volume: ${spike.volumeBurst.toFixed(1)}x normal`);
                console.log(`  Dollar Volume: $${(spike.dollarVolume/1000).toFixed(0)}K`);
                console.log('');
                break;

            case 'spikeUpdate':
                const update = message.data;
                console.log(`📈 UPDATE: ${update.symbol}`);
                console.log(`  Price: $${update.currentPrice.toFixed(2)} (+${update.priceChange.toFixed(2)}%)`);
                console.log(`  Duration: ${update.duration.toFixed(0)}s`);
                console.log(`  Momentum: ${update.momentum}`);
                console.log('');
                break;

            case 'spikeComplete':
                const complete = message.data;
                console.log(`✅ SPIKE ENDED: ${complete.symbol}`);
                console.log(`  Peak: +${complete.priceChange.toFixed(2)}%`);
                console.log(`  Duration: ${complete.duration.toFixed(0)} seconds`);
                console.log(`  High: $${complete.highPrice.toFixed(2)}`);
                console.log('');
                break;

            case 'alert':
                console.log(`🔔 ALERT: ${message.title}`);
                console.log(`  ${message.message}\n`);
                break;
        }
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
    });

    ws.on('close', () => {
        console.log('📡 Disconnected from server');
    });
}

// Check API endpoints
async function testAPI() {
    const axios = require('axios');

    console.log('🔍 Testing API endpoints...\n');

    try {
        // Test active spikes
        const activeRes = await axios.get(`${API_URL}/api/spikes/active`);
        console.log(`📊 Active spikes: ${activeRes.data.count}`);

        // Test completed spikes
        const completedRes = await axios.get(`${API_URL}/api/spikes/completed`);
        console.log(`✅ Completed spikes: ${completedRes.data.count}`);

        // Test stats
        const statsRes = await axios.get(`${API_URL}/api/spikes/stats`);
        const stats = statsRes.data.stats;
        console.log(`📈 Statistics:`);
        console.log(`  - Total detected: ${stats.spikesDetected}`);
        console.log(`  - Spikes/hour: ${stats.spikesPerHour}`);
        console.log(`  - Runtime: ${stats.runtime} minutes`);
        if (stats.bestSpike) {
            console.log(`  - Best spike: ${stats.bestSpike.symbol} +${stats.bestSpike.priceChange.toFixed(1)}%`);
        }
        console.log('');

    } catch (error) {
        console.error('❌ API test failed:', error.message);
    }
}

// Test configuration update
async function testConfig() {
    const axios = require('axios');

    console.log('⚙️  Testing configuration...\n');

    try {
        const config = {
            maxPrice: 50,
            minVolumeBurst: 10,
            minDollarVolume: 1000000
        };

        const res = await axios.post(`${API_URL}/api/spikes/config`, config);
        console.log('✅ Configuration updated successfully\n');

    } catch (error) {
        console.error('❌ Config test failed:', error.message);
    }
}

// Subscribe to test symbols
async function subscribeToSymbols() {
    const axios = require('axios');

    console.log('📊 Subscribing to high-volume symbols...\n');

    try {
        const symbols = ['TSLA', 'NVDA', 'AMD', 'AAPL', 'SPY'];
        const res = await axios.post(`${API_URL}/api/spikes/subscribe`, { symbols });
        console.log(`✅ Subscribed to: ${res.data.subscribed.join(', ')}\n`);

    } catch (error) {
        console.error('❌ Subscribe failed:', error.message);
    }
}

// Main test runner
async function runTests() {
    console.log('Starting spike detection tests...\n');
    console.log('=' .repeat(40) + '\n');

    // Run API tests
    await testAPI();
    await testConfig();
    await subscribeToSymbols();

    // Connect WebSocket and listen
    testWebSocket();

    console.log('🎯 Test running. Press Ctrl+C to stop.\n');
    console.log('Waiting for market spikes...\n');
    console.log('NOTE: Spikes are detected when:');
    console.log('  - Volume is 5x+ normal');
    console.log('  - Price moves 1%+ in 10 seconds');
    console.log('  - Dollar volume > $500K');
    console.log('  - Price < $100\n');
}

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Test stopped');
    process.exit(0);
});

// Start tests
runTests();