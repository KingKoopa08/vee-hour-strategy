# VEE/HOUR/ISPC Trading Strategy Platform - Complete System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Infrastructure & Ports](#infrastructure--ports)
3. [Trading Strategies & Calculations](#trading-strategies--calculations)
4. [API Endpoints](#api-endpoints)
5. [Dashboard Features](#dashboard-features)
6. [Data Sources & Caching](#data-sources--caching)
7. [Deployment Guide](#deployment-guide)
8. [Technical Architecture](#technical-architecture)

---

## System Overview

This is a comprehensive real-time trading analysis platform that monitors pre-market, regular market, and after-hours trading sessions. It provides multiple specialized dashboards for different market periods and implements the VEE/HOUR/ISPC trading strategy.

### Core Components
- **Main Server**: `premarket-server.js` - Node.js/Express server handling all API requests
- **WebSocket Servers**: Real-time data streaming on ports 3006 (market), 3007 (after-hours)
- **Data Provider**: Polygon.io API for real-time and historical market data
- **Multiple Dashboards**: Specialized interfaces for different trading sessions

---

## Infrastructure & Ports

### Local Development
```
Main API Server:     http://localhost:3018
WebSocket (Market):  ws://localhost:3006
WebSocket (AH):      ws://localhost:3007
```

### Production/VPS Deployment
```
Main API Server:     http://[VPS-IP]:3018
WebSocket (Market):  ws://[VPS-IP]:3006
WebSocket (AH):      ws://[VPS-IP]:3007
```

### Port Allocation
- **3018**: Main Express API server (previously 3011, 3012)
- **3006**: WebSocket server for live market data
- **3007**: WebSocket server for after-hours data
- **80**: Nginx serves static HTML files (dashboards)

### Docker Configuration
The application runs in a Docker container with:
- Node.js 18 Alpine base image
- Exposed ports: 3018, 3006, 3007
- Auto-restart policy
- Environment variable: POLYGON_API_KEY

---

## Trading Strategies & Calculations

### 1. VEE/HOUR/ISPC Strategy

#### Core Concept
Identifies stocks with specific volume and price patterns during pre-market that indicate potential day trading opportunities.

#### Selection Criteria
```javascript
// VEE Pattern Detection
- Pre-market volume > 500,000 shares
- Price change > 5% from previous close
- Volume acceleration in last 30 minutes before market open
- RSI between 30-70 (not overbought/oversold)
```

#### Calculations

**Volume Weighted Average Price (VWAP)**
```javascript
VWAP = Σ(Price × Volume) / Σ(Volume)
// Calculated cumulatively throughout the trading day
// Reset at market open (9:30 AM ET)
```

**Relative Strength Index (RSI)**
```javascript
// 14-period RSI calculation
RS = Average Gain / Average Loss
RSI = 100 - (100 / (1 + RS))
// Values > 70 = Overbought
// Values < 30 = Oversold
```

**Bollinger Bands**
```javascript
Middle Band = 20-period SMA
Upper Band = Middle Band + (2 × Standard Deviation)
Lower Band = Middle Band - (2 × Standard Deviation)
// Used for volatility assessment
```

### 2. Pre-Market Analysis

#### Volume Leaders Detection
```javascript
// Fetches top 50 most active stocks
// Then retrieves pre-market data (4:00 AM - 9:30 AM ET)
// Sorts by actual pre-market volume, not regular hours volume

preMarketVolume = aggregateMinuteBars(symbol, '04:00', '09:30')
// Fetches minute-by-minute data and sums volume
```

#### Gap Analysis
```javascript
gapPercent = ((preMarketPrice - previousClose) / previousClose) * 100
// Categorizes:
// - Gap Up: > 2%
// - Gap Down: < -2%
// - Neutral: -2% to 2%
```

### 3. Signal Generation

#### Buy Signals
```javascript
conditions = {
  vwapCross: price > vwap && previousPrice <= vwap,
  volumeSpike: currentVolume > averageVolume * 1.5,
  rsiRange: rsi > 30 && rsi < 70,
  bbPosition: price > lowerBand && price < upperBand
}
```

#### Sell Signals
```javascript
conditions = {
  vwapResistance: price < vwap && previousPrice >= vwap,
  volumeDrop: currentVolume < averageVolume * 0.7,
  rsiExtreme: rsi > 70 || rsi < 30,
  bbBreakout: price > upperBand || price < lowerBand
}
```

---

## API Endpoints

### Market Data Endpoints

#### GET `/api/stocks/top-volume`
Returns top 20 stocks by volume
```javascript
Query Parameters:
- type: 'premarket' | 'regular' | 'afterhours'

Response:
{
  success: true,
  stocks: [{
    rank: 1,
    symbol: "AAPL",
    companyName: "Apple Inc",
    volume: 50000000,
    price: 150.25,
    change: 2.5,
    changePercent: 1.68,
    premarketVolume: 2000000,
    hasPremarketData: true
  }]
}
```

#### GET `/api/premarket/top-stocks`
Pre-market specific endpoint with detailed metrics
```javascript
Response includes:
- Pre-market volume leaders
- Gap up/down stocks
- Unusual volume alerts
- Price momentum indicators
```

#### GET `/api/afterhours/top-movers`
After-hours trading analysis
```javascript
Response includes:
- Extended hours volume
- Price movement from close
- Institutional activity indicators
```

### Real-Time WebSocket Events

#### Market Data Stream (Port 3006)
```javascript
Events:
- 'price_update': Real-time price changes
- 'volume_alert': Unusual volume detected
- 'signal': Buy/sell signal generated
- 'market_status': Open/close notifications
```

#### After-Hours Stream (Port 3007)
```javascript
Events:
- 'ah_price': After-hours price updates
- 'ah_volume': Extended hours volume
- 'earnings_alert': Earnings-related movements
```

---

## Dashboard Features

### 1. Landing Page (index.html)
- **URL**: `/`
- **Purpose**: Hub for accessing all specialized dashboards
- **Features**: 
  - Quick navigation to all dashboards
  - Market status indicator
  - Time zone display (ET/MT)

### 2. Pre-Market Dashboard (premarket-dashboard.html)
- **URL**: `/premarket-dashboard.html`
- **Active Hours**: 4:00 AM - 9:30 AM ET
- **Features**:
  - Top pre-market volume leaders
  - Gap up/down scanners
  - VEE pattern detection
  - Volume acceleration tracking
  - News catalyst integration

### 3. Market Dashboard (market-dashboard.html)
- **URL**: `/market-dashboard.html`
- **Active Hours**: 9:30 AM - 4:00 PM ET
- **Features**:
  - Real-time top volume stocks
  - VWAP tracking
  - RSI indicators
  - Bollinger Bands visualization
  - Auto-refresh every 10 seconds during market hours

### 4. Live Trading Dashboard (live-dashboard.html)
- **URL**: `/live-dashboard.html`
- **Purpose**: Real-time trading signals and analysis
- **Features**:
  - WebSocket live price feeds
  - Signal generation (buy/sell)
  - Technical indicator overlay
  - Volume profile analysis
  - Multi-timeframe analysis

### 5. After-Hours Dashboard (afterhours-dashboard.html)
- **URL**: `/afterhours-dashboard.html`
- **Active Hours**: 4:00 PM - 8:00 PM ET
- **Features**:
  - Extended hours movers
  - Earnings reaction tracking
  - Institutional activity detection
  - Next-day gap predictions

---

## Data Sources & Caching

### Polygon.io Integration
```javascript
API_KEY: 'AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW'
Base URL: 'https://api.polygon.io'

Main Endpoints Used:
- /v2/snapshot/locale/us/markets/stocks/tickers (Market snapshot)
- /v2/aggs/ticker/{symbol}/range/1/minute/{from}/{to} (Minute bars)
- /v1/open-close/{symbol}/{date} (Daily OHLC)
- /v2/reference/tickers (Stock metadata)
```

### Caching Strategy
```javascript
// Market snapshot cache
snapshotCache: {
  data: Object,
  timestamp: Date,
  TTL: 30000ms (30 seconds)
}

// Pre-market data cache
premarketDataCache: Map<symbol, data>
TTL: 120000ms (2 minutes)
// Refreshes automatically during pre-market hours

// Company info cache
companyInfoCache: Map<symbol, info>
TTL: 86400000ms (24 hours)
// Rarely changes, long cache time
```

### Rate Limiting Protection
```javascript
// Batch processing for API calls
batchSize: 10 symbols
delayBetweenBatches: 200ms

// Request queuing
maxConcurrentRequests: 5
requestDelay: 100ms
```

---

## Deployment Guide

### Local Development
```bash
# Install dependencies
npm install

# Run locally
node premarket-server.js

# Access at http://localhost:3018
```

### VPS/Production Deployment
```bash
# On VPS server
cd /path/to/vee-hour-strategy
git pull origin main

# Deploy with Docker (recommended)
./deploy.sh

# Manual Docker commands
docker build --no-cache -t premarket-strategy .
docker run -d \
  --name premarket-strategy \
  -p 3018:3018 \
  -p 3006:3006 \
  -p 3007:3007 \
  -e POLYGON_API_KEY=$POLYGON_API_KEY \
  --restart unless-stopped \
  premarket-strategy

# Check logs
docker logs -f premarket-strategy
```

### Deploy Script Features
- Stops existing containers
- Removes old Docker images (forces fresh build)
- Builds with --no-cache flag
- Auto-restart policy
- Health check after deployment

---

## Technical Architecture

### File Structure
```
/
├── premarket-server.js      # Main API server
├── index.html               # Landing page
├── premarket-dashboard.html # Pre-market scanner
├── market-dashboard.html    # Market hours dashboard
├── live-dashboard.html      # Live trading interface
├── afterhours-dashboard.html # After-hours tracker
├── real-dashboard.html      # Alternative trading view
├── package.json            # Node dependencies
├── Dockerfile              # Docker configuration
├── deploy.sh              # Deployment script
├── premarket-api-test.js  # API testing utility
├── find-premarket-leaders.js # Pre-market scanner script
└── VPS_DEPLOYMENT.md      # Deployment instructions
```

### Dependencies
```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "ws": "^8.13.0",
  "axios": "^1.4.0",
  "dotenv": "^16.3.1"
}
```

### Environment Variables
```bash
POLYGON_API_KEY=AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW
PORT=3018  # Optional, defaults to 3018
```

### Dynamic URL Handling
All dashboards use dynamic hostname detection:
```javascript
const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3018' 
  : `http://${window.location.hostname}:3018`;
```

### Error Handling
- Automatic reconnection for WebSocket disconnections
- Fallback to cached data when API fails
- Rate limit retry with exponential backoff
- Graceful degradation for missing data

---

## Common Issues & Solutions

### Issue: Dashboard shows "localhost" error on VPS
**Solution**: Clear browser cache (Ctrl+F5), dashboards now use dynamic hostnames

### Issue: Pre-market volumes showing low/incorrect
**Solution**: Server now fetches actual pre-market data (4-9:30 AM ET) for top 50 stocks

### Issue: Docker container using old code
**Solution**: Deploy script now uses `--no-cache` flag to force fresh builds

### Issue: WebSocket connection fails
**Solution**: Ensure ports 3006/3007 are open in firewall/security groups

### Issue: API rate limits
**Solution**: Implemented batching and caching to minimize API calls

---

## Performance Optimizations

1. **Batch API Requests**: Groups symbols in batches of 10
2. **Smart Caching**: Different TTL for different data types
3. **WebSocket Efficiency**: Only sends updates on significant changes
4. **Lazy Loading**: Dashboards load data on-demand
5. **Auto-refresh Logic**: Only during active trading hours

---

## Future Enhancements Roadmap

1. **Database Integration**: Historical data storage
2. **User Authentication**: Personal watchlists and alerts
3. **Advanced Strategies**: ML-based pattern recognition
4. **Mobile App**: React Native companion app
5. **Backtesting Engine**: Strategy performance validation
6. **Alert System**: Email/SMS notifications
7. **Options Flow**: Unusual options activity tracking

---

## Quick Reference Commands

```bash
# Check if server is running
docker ps | grep premarket

# View real-time logs
docker logs -f premarket-strategy

# Restart container
docker restart premarket-strategy

# Pull latest changes and redeploy
git pull origin main && ./deploy.sh

# Test API endpoint
curl http://localhost:3018/api/stocks/top-volume

# Check port usage
lsof -i :3018
```

---

## Contact & Support

- GitHub Repository: https://github.com/KingKoopa08/vee-hour-strategy
- Primary API: Polygon.io
- Deployment Platform: Docker on Linux VPS
- Node Version: 18 Alpine

---

*Last Updated: September 2025*
*Version: 1.0.0*