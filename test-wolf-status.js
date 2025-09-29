const axios = require('axios');

// Start the server first
const { spawn } = require('child_process');
const scanner = spawn('node', ['unified-scanner.js']);

// Wait for server to start
setTimeout(async () => {
    try {
        // Check gainers endpoint
        const gainersRes = await axios.get('http://localhost:3050/api/gainers');
        const wolf = gainersRes.data.stocks.find(s => s.symbol === 'WOLF');

        if (wolf) {
            console.log('\n✅ WOLF found in gainers:');
            console.log('Symbol:', wolf.symbol);
            console.log('Trading Status:', wolf.tradingStatus);
            console.log('Price:', wolf.price);
            console.log('Day Change:', wolf.dayChange);
        } else {
            console.log('❌ WOLF not found in gainers');
        }

        // Check volume endpoint
        const volumeRes = await axios.get('http://localhost:3050/api/volume');
        const wolfVolume = volumeRes.data.stocks.find(s => s.symbol === 'WOLF');

        if (wolfVolume) {
            console.log('\n✅ WOLF found in volume movers:');
            console.log('Symbol:', wolfVolume.symbol);
            console.log('Trading Status:', wolfVolume.tradingStatus);
        } else {
            console.log('❌ WOLF not found in volume movers');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }

    // Kill the server
    scanner.kill();
    process.exit(0);
}, 3000);

// Capture server output
scanner.stdout.on('data', (data) => {
    if (data.toString().includes('WOLF')) {
        console.log('Server:', data.toString().trim());
    }
});