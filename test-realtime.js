const RealtimeRocketDetector = require('./realtime-rocket-detector');
require('dotenv').config();

// Configuration
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW';
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1417342951251775550/u12auC9U02p5UdnistIyo716xWaj9S6c1CvJaOTEK_Yk3MFZ6AFMT4vnKelgKJcMaJq9';

// Top volume stocks to monitor in real-time
const SYMBOLS_TO_WATCH = [
    'SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'AMZN', 'META', 'GOOGL',
    'PLTR', 'SOFI', 'NIO', 'RIVN', 'F', 'BAC', 'WFC', 'XLF', 'COIN', 'MARA'
];

console.log('🚀 REAL-TIME ROCKET DETECTOR');
console.log('============================');
console.log(`📊 Monitoring ${SYMBOLS_TO_WATCH.length} symbols in real-time`);
console.log('🔌 Connecting to Polygon WebSocket...');
console.log('');

// Create detector
const detector = new RealtimeRocketDetector(POLYGON_API_KEY, DISCORD_WEBHOOK);

// Listen for rocket detections
detector.polygonWS.on('rocket_detected', (rocket) => {
    console.log('');
    console.log('════════════════════════════════════════');
    console.log('🚨 ROCKET ALERT 🚨');
    console.log('Symbol:', rocket.symbol);
    console.log('Price:', `$${rocket.price}`);
    console.log('Trigger:', rocket.trigger);
    console.log('Time:', new Date().toLocaleTimeString());
    console.log('════════════════════════════════════════');
    console.log('');
});

// Start monitoring
detector.start(SYMBOLS_TO_WATCH);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down Real-Time Rocket Detector...');
    detector.stop();
    process.exit(0);
});

console.log('✅ Real-time monitoring active!');
console.log('📍 Tracking:');
console.log('   - Live trades (every trade)');
console.log('   - Price spikes (5% in 1 minute)');
console.log('   - Volume surges (10x average)');
console.log('   - Large trades (>50k shares)');
console.log('   - Wide spreads (>1%)');
console.log('');
console.log('Press Ctrl+C to stop');
console.log('');