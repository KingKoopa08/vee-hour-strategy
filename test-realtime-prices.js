const WebSocket = require('ws');
require('dotenv').config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV';
const symbols = ['AAPL', 'TSLA', 'SPY', 'NVDA', 'IBG']; // Test symbols

console.log('🔌 Connecting to Polygon WebSocket for REAL-TIME prices...\n');

const ws = new WebSocket('wss://socket.polygon.io/stocks');
const prices = new Map();

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
        if (msg.ev === 'status' && msg.status === 'auth_success') {
            console.log('✅ Authentication successful\n');

            // Subscribe to trades for our symbols
            const subscriptions = symbols.map(s => `T.${s}`).join(',');
            ws.send(JSON.stringify({
                action: 'subscribe',
                params: subscriptions
            }));

            console.log(`📊 Subscribed to real-time trades for: ${symbols.join(', ')}\n`);
            console.log('Watching for price changes (trades will show as they happen):\n');
        }

        // Handle trade messages
        if (msg.ev === 'T') { // Trade event
            const oldPrice = prices.get(msg.sym);
            const newPrice = msg.p;

            if (oldPrice !== newPrice) {
                const change = oldPrice ? ((newPrice - oldPrice) / oldPrice * 100).toFixed(3) : 0;
                const arrow = oldPrice && newPrice > oldPrice ? '↑' : oldPrice && newPrice < oldPrice ? '↓' : '→';

                console.log(`${new Date().toLocaleTimeString()} | ${msg.sym}: $${newPrice.toFixed(2)} ${arrow} (${change > 0 ? '+' : ''}${change}%) | Volume: ${msg.s}`);

                prices.set(msg.sym, newPrice);
            }
        }
    });
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('🔌 WebSocket disconnected');
});

// Keep running
console.log('Press Ctrl+C to stop\n');