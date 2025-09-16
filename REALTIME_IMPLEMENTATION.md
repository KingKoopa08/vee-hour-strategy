# 🚀 Real-Time Rocket Detection System

## Overview
Instead of scanning at intervals (every 30 seconds), we now use **WebSocket connections** to get real-time streaming data from Polygon.io. This means:
- **Instant detection** - Rockets are detected the moment they happen
- **Every trade matters** - We see every single trade, not just snapshots
- **Lower latency** - Sub-second detection vs 30-60 second delays
- **Better accuracy** - No missing spikes between scans

## How It Works

### 1. **WebSocket Connection** (`polygon-websocket.js`)
- Maintains persistent connection to Polygon's real-time feed
- Auto-reconnects if connection drops
- Authenticates with API key
- Subscribes to multiple data streams per symbol

### 2. **Real-Time Data Streams**
We receive 4 types of real-time data:

#### **Trades (T.)**
- Every single trade execution
- Price, size, timestamp
- Detects: Large trades, rapid trading

#### **Quotes (Q.)**
- Bid/ask updates
- Spread analysis
- Detects: Wide spreads, volatility

#### **Second Aggregates (A.)**
- OHLCV data every second
- Immediate price action
- Detects: Quick spikes

#### **Minute Aggregates (AM.)**
- OHLCV data every minute
- Volume analysis
- Detects: Price rockets, volume surges

### 3. **Rocket Detection Signals**
The system looks for multiple signals happening together:

```javascript
SIGNALS = {
    PRICE_SPIKE: '>5% move in 1 minute',
    VOLUME_SPIKE: '10x average volume',
    LARGE_TRADE: '>50k shares in single trade',
    RAPID_TRADING: '>100 trades per second',
    HIGH_VOLATILITY: '>1% bid-ask spread'
}
```

**Rocket = 2+ signals triggered together**

### 4. **Smart Alerting**
- 5-minute cooldown per symbol (no spam)
- Discord alerts with color coding
- Different alert levels based on magnitude

## Advantages Over Interval Scanning

| Interval Scanning | Real-Time WebSocket |
|-------------------|---------------------|
| 30-60 second delay | Sub-second detection |
| Misses spikes between scans | Catches every spike |
| High API usage (polling) | Low API usage (streaming) |
| Snapshot data only | Full trade-by-trade data |
| Can't detect momentum | Tracks acceleration in real-time |

## Implementation

### Start Real-Time Monitoring
```javascript
const detector = new RealtimeRocketDetector(API_KEY, DISCORD_WEBHOOK);
detector.start(['AAPL', 'TSLA', 'SPY']); // Monitor these symbols
```

### Listen for Rockets
```javascript
detector.on('rocket_detected', (rocket) => {
    console.log(`🚀 ${rocket.symbol}: ${rocket.trigger}`);
});
```

### Test It
```bash
node test-realtime.js
```

## Cost Considerations

### Polygon.io WebSocket Limits
- **Starter Plan**: 1 connection, unlimited messages
- **Developer Plan**: 2 connections, unlimited messages  
- **Professional Plan**: 10 connections, unlimited messages

We use 1 connection for all symbols, so even Starter plan works!

### Data Usage
- Each symbol generates ~100-1000 messages per minute during active trading
- 20 symbols = ~20,000 messages per minute
- Still well within limits

## Next Steps

### Frontend Integration
Update `rocket-scanner.html` to use WebSocket instead of polling:
```javascript
// Old way (polling)
setInterval(scanForRockets, 30000);

// New way (WebSocket)
const ws = new WebSocket('ws://localhost:3006');
ws.onmessage = (event) => {
    const rocket = JSON.parse(event.data);
    addRocketCard(rocket); // Instant update!
};
```

### Advanced Features
1. **Pattern Recognition**
   - Track price/volume patterns
   - Detect accumulation/distribution
   - Identify breakout setups

2. **Smart Symbol Selection**
   - Auto-add symbols that gap up
   - Monitor top gainers dynamically
   - Follow unusual options activity

3. **Machine Learning**
   - Train on successful rockets
   - Predict which spikes will continue
   - Filter false positives

## Deployment

Add to `premarket-server.js`:
```javascript
const RealtimeRocketDetector = require('./realtime-rocket-detector');

// Start real-time detection
const detector = new RealtimeRocketDetector(
    process.env.POLYGON_API_KEY,
    adminSettings.webhooks.rocket
);

// Get top 50 active symbols
const topSymbols = await getTopActiveSymbols();
detector.start(topSymbols);
```

## Monitoring Performance

The real-time system tracks:
- Messages per second
- Detection latency
- Memory usage
- Connection stability

Check metrics:
```bash
docker exec premarket-strategy node metrics.js
```

## Troubleshooting

### Connection Issues
- Check API key is valid
- Verify WebSocket port (wss://socket.polygon.io) is not blocked
- Look for auth errors in logs

### Missing Detections
- Increase symbol list
- Lower thresholds for testing
- Check Discord webhook is working

### High Memory Usage
- Reduce symbols monitored
- Clear old trade data more frequently
- Use connection pooling

## Summary

**Real-time data is the future of rocket detection:**
- ⚡ Instant detection (< 1 second)
- 📊 Every trade analyzed
- 🎯 Higher accuracy
- 💰 Same API cost
- 🚀 Catch rockets as they launch, not after!