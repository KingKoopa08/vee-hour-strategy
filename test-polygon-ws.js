const WebSocket = require('ws');

const POLYGON_API_KEY = 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';

console.log('Testing Polygon WebSocket connection...\n');

const ws = new WebSocket('wss://socket.polygon.io/stocks');

let messageCount = 0;
let tradeCount = 0;

ws.on('open', () => {
    console.log('✅ Connected to Polygon WebSocket');

    // Authenticate
    ws.send(JSON.stringify({
        action: 'auth',
        params: POLYGON_API_KEY
    }));
});

ws.on('message', (data) => {
    const messages = JSON.parse(data.toString());

    messages.forEach(msg => {
        messageCount++;

        if (messageCount <= 5) {
            console.log(`Message ${messageCount}:`, msg);
        }

        if (msg.ev === 'status' && msg.status === 'auth_success') {
            console.log('\n✅ Authentication successful');
            console.log('Subscribing to SPY, AAPL, TSLA trades...\n');

            // Subscribe to a few active stocks
            ws.send(JSON.stringify({
                action: 'subscribe',
                params: 'T.SPY,T.AAPL,T.TSLA,T.NVDA,T.AMD'
            }));
        }

        if (msg.ev === 'T') {
            tradeCount++;
            if (tradeCount <= 10) {
                console.log(`Trade ${tradeCount}: ${msg.sym} @ $${msg.p} x ${msg.s} shares`);
            }

            if (tradeCount === 10) {
                console.log('\n✅ Successfully receiving trades!');
                console.log('Closing connection...');
                ws.close();
            }
        }
    });
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('\n📊 Summary:');
    console.log(`  - Total messages: ${messageCount}`);
    console.log(`  - Total trades: ${tradeCount}`);
    process.exit(0);
});

// Timeout after 30 seconds
setTimeout(() => {
    console.log('\n⏱️ Timeout - closing connection');
    ws.close();
}, 30000);