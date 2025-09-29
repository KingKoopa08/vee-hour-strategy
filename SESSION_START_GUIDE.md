# 🚀 PreMarket Strategy - Session Start Guide

## Quick Start Commands

### 1. Start the Scanner
```bash
cd /mnt/d/Cursor\ Ideas/PreMarket_Stratedy
node unified-scanner.js
```

### 2. Access the Applications
- **Main Hub**: http://localhost:3050
- **Volume Movers**: http://localhost:3050/volume
- **Top Gainers**: http://localhost:3050/gainers
- **Whale Detector**: http://localhost:3050/whales
- **API Endpoint**: http://localhost:3050/api/gainers

## Key Features & What They Do

### Volume Movers Page (PRIMARY TOOL)
- **Buy Pressure Indicator**: 0-100 score (50 = neutral, >70 = strong buy pressure)
- **Volume Rate**: Shows actual volume flow (K/min or M/min) when trades occur
- **Price Changes**: Tracks 30s, 1m, 2m, 3m, 5m price movements
- **Volume Changes**: Shows % changes or "0%" when no trades (common in pre-market)

### Important Notes
1. **Volume in Pre-Market**: Often shows 0% because Polygon API provides static data
2. **Buy Pressure**: Combines price movement, volume, and day performance
3. **MSS Tracking**: Watch for sudden price spikes with Buy Pressure >75

## Common Issues & Solutions

### Issue: Volume shows 0% everywhere
**Solution**: This is NORMAL during pre-market. The API doesn't update volume frequently. Watch for:
- Price changes (these update more frequently)
- Buy Pressure changes (indicates activity)
- Occasional volume spikes when trades actually occur

### Issue: Server won't start
**Solution**:
```bash
# Kill any existing processes
pkill -f "node unified-scanner"
# Or find and kill specific process
ps aux | grep unified-scanner
kill -9 [PID]
```

### Issue: Page not updating
**Solution**: Check WebSocket connection status (should show 🟢 Connected)

## Critical Trading Windows (Mountain Time)
- **6:05 AM MT**: Primary entry signal window
- **6:35 AM MT**: Directional bias confirmation
- **7:55 AM MT**: Common breakout time
- **8:40 AM MT**: Secondary rotation opportunity

## Environment Setup

### Required Files
1. `.env` file with Polygon API key:
```
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV
PORT=3050
WS_PORT=3051
```

2. Main files:
- `unified-scanner.js` - Backend server
- `volume-movers-page.html` - Volume tracking interface
- `README.md` - Full documentation

### Dependencies
```bash
npm install axios dotenv express ws
```

## What to Watch For

### Buy Signals (6:05 AM Strategy)
1. Stock trending down from pre-market high
2. Buy Pressure > 60 climbing toward 70+
3. Volume rate showing activity (not 0%)
4. Price showing positive 30s/1m changes

### MSS Pattern Example
- Watch for: +25% price spike → Buy Pressure 75-85
- Then: Brief pullback → Buy Pressure drops to 60-65
- Entry: When Buy Pressure starts climbing again

## Enhanced Volume Tracking System

### What Was Fixed
1. **Volume Rate Tracking**: Shows shares/minute when volume changes
2. **Activity Detection**: Tracks when volume actually changes
3. **Stable Display**: No more flashing "No Activity" messages
4. **Enhanced Buy Pressure**: Incorporates volume rate as key factor

### How It Works Now
- When volume changes: Displays rate (e.g., "10.5K/min")
- When no changes: Shows "0%" (normal for pre-market)
- Buy Pressure still updates based on price movements

## Server Monitoring

### Check if Running
```bash
# See all running instances
ps aux | grep unified-scanner

# Check logs from background process
# When starting with: node unified-scanner.js &
# View output with: tail -f nohup.out
```

### Performance Indicators
- Updates every 1 second during market hours
- WebSocket broadcasts to all connected clients
- Tracks ~175 stocks simultaneously
- API calls complete in <350ms typically

## Debugging Commands

### View Live Logs
```bash
# If running in foreground
# Just watch the terminal output

# If running with PM2
pm2 logs market-scanner

# Check for MSS specifically
node unified-scanner.js | grep MSS
```

### Test API Endpoints
```bash
# Test gainers endpoint
curl http://localhost:3050/api/gainers

# Test volume endpoint
curl http://localhost:3050/api/volume

# Check server health
curl http://localhost:3050/api/status
```

## Session Checklist

- [ ] Start scanner: `node unified-scanner.js`
- [ ] Open Volume Movers: http://localhost:3050/volume
- [ ] Verify WebSocket shows 🟢 Connected
- [ ] Check current market session (Pre-Market/Regular/After Hours)
- [ ] Sort by Buy Pressure (click column header)
- [ ] Watch for MSS and similar volatile stocks
- [ ] Monitor 6:05 AM, 6:35 AM, 7:55 AM MT windows

## Important Reminders

1. **Buy Pressure of 50** = Neutral (no strong direction)
2. **Volume 0%** = Normal in pre-market (API limitation)
3. **Price changes** = More reliable than volume in pre-market
4. **Multiple instances** = Kill old ones before starting new
5. **MSS example** = Your target pattern for entries

## Quick Troubleshooting

```bash
# Full restart sequence
pkill -f "node unified-scanner"
cd /mnt/d/Cursor\ Ideas/PreMarket_Stratedy
node unified-scanner.js

# Then open in browser
# http://localhost:3050/volume
```

---

**Remember**: You missed MSS because volume wasn't showing changes. Now the system shows Buy Pressure changes even when volume is static, giving you better entry signals.