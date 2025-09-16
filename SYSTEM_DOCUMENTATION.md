# PreMarket Strategy - Rocket Scanner System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture & Infrastructure](#architecture--infrastructure)
3. [Rocket Scanner Features](#rocket-scanner-features)
4. [Real-Time Updates](#real-time-updates)
5. [Stock Categorization Logic](#stock-categorization-logic)
6. [Alert System](#alert-system)
7. [Admin Configuration](#admin-configuration)
8. [API Endpoints](#api-endpoints)
9. [Recent Updates & Fixes](#recent-updates--fixes)
10. [Deployment Guide](#deployment-guide)
11. [Troubleshooting](#troubleshooting)
12. [Technical Details](#technical-details)

---

## System Overview

The PreMarket Strategy Rocket Scanner is a real-time stock market monitoring system that identifies significant price movements ("rockets") during pre-market, regular, and after-hours trading. It features:

- **Real-time WebSocket updates** for live price tracking
- **Intelligent stock categorization** (Momentum Leaders, Consolidating, Pullbacks)
- **Discord alert integration** with customizable thresholds
- **Admin panel** for configuration management
- **Momentum tracking** with 1-minute and 5-minute intervals

### Core Components

1. **Backend Server** (`premarket-server.js`)
   - Express API server on port 3018
   - WebSocket server for real-time updates
   - Polygon.io API integration
   - Discord webhook integration
   - Settings persistence with JSON file storage

2. **Frontend Dashboard** (`rocket-scanner.html`)
   - Real-time stock monitoring interface
   - Three-category display system
   - Live WebSocket price updates
   - Momentum and trend indicators
   - News integration

3. **Admin Panel** (`admin.html`)
   - Password-protected configuration
   - Discord webhook management
   - Alert threshold settings
   - Max price filtering ($100 default)
   - Master alert toggle

---

## Architecture & Infrastructure

### Port Configuration

#### Development
```
Main API:     http://localhost:3018
WebSocket:    ws://localhost:3006  (separate port)
Admin Panel:  http://localhost:3018/admin.html
```

#### Production
```
Main API:     http://[SERVER_IP]:3018
WebSocket:    ws://[SERVER_IP]:3018/ws  (same port, /ws path)
Admin Panel:  http://[SERVER_IP]:3018/admin.html
```

### WebSocket Implementation

The system uses different WebSocket configurations for development and production:

```javascript
// Development: Separate port
ws://localhost:3006

// Production: Path-based on same port
ws://production-server:3018/ws
```

This prevents firewall issues in production environments.

---

## Rocket Scanner Features

### Dashboard Components

1. **Header Statistics**
   - Total rockets count
   - Top gainer display
   - Top volume display
   - Last scan timestamp

2. **Category Sections**
   - **🚀 Momentum Leaders**: Rising stocks with positive momentum
   - **⏸️ Consolidating**: Sideways movement, potential breakout candidates
   - **📉 Pullbacks**: Declining stocks, potential reversal opportunities

3. **Stock Cards Display**
   - Symbol and company name
   - Current price with real-time updates
   - Day change percentage
   - Volume with formatting (K/M/B)
   - 1-minute and 5-minute momentum
   - Alert level indicators
   - News catalyst badges

### Real-Time Features

- **Price Updates**: Every 2 seconds via WebSocket
- **Rocket Scans**: Every 30 seconds for new movers
- **Visual Feedback**: Price flash animation on update
- **Momentum Preservation**: Values persist between updates

---

## Real-Time Updates

### WebSocket Events

#### Server → Client Events

1. **`rocketsUpdate`** (every 30 seconds)
```javascript
{
  type: 'rocketsUpdate',
  data: {
    momentumLeaders: [...],
    consolidating: [...],
    pullbacks: [...]
  }
}
```

2. **`priceUpdates`** (every 2 seconds)
```javascript
{
  type: 'priceUpdates',
  data: [{
    symbol: 'AAPL',
    price: 150.25,
    changePercent: 2.5,
    priceChange1m: 0.15,
    priceChange5m: 0.48
  }]
}
```

### Update Mechanisms

1. **Initial Load**: Fetches from `/api/rockets/scan`
2. **WebSocket Updates**: Continuous real-time streaming
3. **Fallback**: Auto-refresh every 30 seconds if WebSocket fails

---

## Stock Categorization Logic

### Initial Categorization (No Momentum Data)

When stocks first load without momentum history:

```javascript
// Momentum Leaders (immediate classification)
- Stocks up 50%+ → Always momentum leaders
- Stocks up 25-50% + volume > 5M → Momentum leaders  
- Stocks up 15-25% + volume > 10M + level ≥ 2 → Momentum leaders

// Consolidating
- Stocks up 10-25% with normal volume
- Small moves (< 10% change)

// Pullbacks
- Stocks down 5% or more
```

### Refined Categorization (With Momentum Data)

Once 1-minute and 5-minute data accumulates:

```javascript
// Check for valid momentum data
hasMomentumData = Math.abs(priceChange1m) > 0.01

// Momentum Leaders
if (priceChange1m > 0.1 && (!priceChange5m || priceChange5m > 0))

// Pullbacks  
if (priceChange1m < -0.1)

// Consolidating
// Everything else
```

### Why Categorization Matters

- **Momentum Leaders**: Best candidates for continuation trades
- **Consolidating**: Watch for breakout/breakdown
- **Pullbacks**: Potential reversal or further decline

---

## Alert System

### Alert Levels

| Level | Name | Price Change | Volume | Discord Color |
|-------|------|-------------|--------|---------------|
| 1 | WATCH | 10% | 500K | Blue |
| 2 | ALERT | 20% | 500K | Yellow |
| 3 | URGENT | 50% | 1M | Orange |
| 4 | JACKPOT | 100% | 5M | Red |

### Alert Filtering

1. **Max Price Threshold**
   - Default: $100
   - Stocks above threshold won't trigger alerts
   - Set to 0 to disable filtering
   - Configured in admin panel

2. **Master Toggle**
   - Global on/off for all Discord alerts
   - Preserves webhook settings when disabled

3. **Duplicate Prevention**
   - Tracks sent alerts by symbol + date + level
   - Prevents spam for same stock
   - Cache cleared periodically (keeps last 250)

### Discord Integration

```javascript
// Webhook Priority
1. News alerts → News webhook
2. Level 3+ alerts → Urgent webhook (if configured)
3. All other alerts → Rocket webhook
```

---

## Admin Configuration

### Access Credentials
- URL: `/admin.html`
- Default Password: `rocket123` (change in production!)
- Session-based authentication

### Configurable Settings

1. **Discord Webhooks**
   - Rocket alerts webhook
   - News alerts webhook  
   - Urgent alerts webhook (optional)

2. **Alert Thresholds**
   - Four levels with price % and volume
   - Max price threshold for filtering

3. **Scanner Settings**
   - Scan interval (default 30s)
   - Volume multiplier
   - Pre-market/after-hours toggles
   - News monitoring toggle

### Settings Persistence

Settings are saved to `admin-settings.json`:
```json
{
  "webhooks": {
    "rocket": "https://discord.com/api/webhooks/...",
    "news": "https://discord.com/api/webhooks/...",
    "urgent": ""
  },
  "maxPriceThreshold": 100,
  "alertsEnabled": true,
  "thresholds": {
    "l1": { "price": 10, "volume": 500000 },
    "l2": { "price": 20, "volume": 500000 },
    "l3": { "price": 50, "volume": 1000000 },
    "l4": { "price": 100, "volume": 5000000 }
  }
}
```

---

## API Endpoints

### Public Endpoints

#### GET `/api/rockets/scan`
Returns categorized rockets with momentum data
```javascript
{
  success: true,
  rockets: {
    momentumLeaders: [...],
    consolidating: [...],
    pullbacks: [...]
  }
}
```

#### GET `/api/stocks/top-volume`
High volume stocks for fallback
```javascript
{
  success: true,
  stocks: [{
    symbol: "AAPL",
    price: 150.25,
    changePercent: 2.5,
    volume: 50000000
  }]
}
```

#### GET `/api/news`
Market news with filtering
```javascript
{
  success: true,
  news: [{
    headline: "...",
    symbol: "AAPL",
    timestamp: "2024-01-01T10:00:00Z"
  }]
}
```

### Admin Endpoints

#### GET `/api/admin/settings`
Retrieve all configuration

#### POST `/api/admin/thresholds`
Save alert thresholds and max price
```javascript
{
  thresholds: {...},
  alertsEnabled: true,
  maxPriceThreshold: 100
}
```

#### POST `/api/admin/webhooks`
Update Discord webhooks

#### POST `/api/admin/test-webhook`
Test Discord webhook connectivity

---

## Recent Updates & Fixes

### 1. Flexible Momentum Calculation (Latest - Current Session)
**Problem**: Momentum values showing 0.0% in WebSocket updates despite price changes

**Root Cause**: Narrow time windows (50-70s for 1m, 280-320s for 5m) often didn't match any entries in price history

**Solution**: Implemented progressive search with fallback mechanisms:
```javascript
// Progressive search strategy:
// 1. Try exact window (50-70s for 1m)
// 2. Expand to wider range (40-90s for 1m)  
// 3. Find closest available entry as last resort

// For 1-minute momentum
let oneMinAgo = history.find(h => {
    const age = now - h.timestamp;
    return age >= 50000 && age <= 70000; // Exact window
});

if (!oneMinAgo) {
    // Try wider range
    oneMinAgo = history.find(h => {
        const age = now - h.timestamp;
        return age >= 40000 && age <= 90000;
    });
}

if (!oneMinAgo && history.length > 5) {
    // Find closest to 60 seconds
    oneMinAgo = history.reduce((closest, entry) => {
        const age = now - entry.timestamp;
        if (age < 30000 || age > 120000) return closest;
        // Return entry closest to target
        return Math.abs(age - 60000) < Math.abs(closestAge - 60000) ? entry : closest;
    }, null);
}
```

### 2. Momentum Values Clearing Fix
**Problem**: 1m and 5m momentum values reset to 0.00 on WebSocket updates

**Solution**: Modified `updateRealTimePrices()` to check for valid data:
```javascript
// Only update when valid data present
if (momentum1mElement && update.priceChange1m !== undefined && update.priceChange1m !== null) {
    momentum1mElement.textContent = `1m: ${update.priceChange1m >= 0 ? '+' : ''}${update.priceChange1m.toFixed(1)}%`;
}
// Don't update if undefined/null
```

### 3. Max Price Threshold Implementation
**Feature**: Filter expensive stocks from alerts (default $100)

**Changes**:
- Added `maxPriceThreshold` to admin settings
- UI input in admin panel
- Price check in `sendDiscordAlert()`
- Console logging when alerts skipped
- Set to 0 to disable filtering

### 4. Immediate Stock Categorization
**Problem**: Stocks waited for momentum data before categorizing

**Solution**: Smart initial categorization based on day performance:
```javascript
// Use day change % and volume for immediate categorization
// Refine with momentum data when available
if (!hasMomentumData) {
  // Smart defaults based on performance
  if (dayChange >= 50) momentumLeaders.push(rocket);
  else if (dayChange >= 25 && volume > 5000000) momentumLeaders.push(rocket);
  // etc...
} else {
  // Precise momentum-based categorization
  if (priceChange1m > 0.1 && (!priceChange5m || priceChange5m > 0)) {
    momentumLeaders.push(rocket);
  }
}
```

### 5. WebSocket Production Fix
**Problem**: WebSocket failed on port 3006 in production (firewall issues)

**Solution**: Path-based WebSocket on same port:
- Development: `ws://localhost:3006` (separate port)
- Production: `ws://server:3018/ws` (path-based)

### 6. Flat Stock Alert Prevention
**Problem**: Stocks like FGI and TURB triggered alerts despite being flat

**Solution**: Added minimum requirements for alerts:
- Require at least 10% day change
- Verify positive momentum (1m > 0.1%)
- Check price history depth before alerting

---

## Deployment Guide

### Local Development

```bash
# Install dependencies
npm install

# Start development server
./start-local.sh
# OR
NODE_ENV=development node premarket-server.js

# Access
Dashboard: http://localhost:3018
Admin: http://localhost:3018/admin.html
```

### Production Deployment

#### Using Docker (Recommended)

```bash
# Quick deploy
./deploy.sh

# Manual Docker commands
docker build -t premarket-strategy .
docker run -d --name premarket-strategy \
  -p 3018:3018 \
  -e NODE_ENV=production \
  --restart unless-stopped \
  premarket-strategy
```

#### Docker Configuration (`Dockerfile`)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps
COPY . .
EXPOSE 3018
ENV NODE_ENV=production
CMD ["node", "premarket-server.js"]
```

#### Deployment Script (`deploy.sh`)
```bash
#!/bin/bash
cd /opt/vee-hour-strategy
git pull origin main
docker stop premarket-strategy
docker rm premarket-strategy  
docker build --no-cache -t premarket-strategy .
docker run -d --name premarket-strategy \
  -e NODE_ENV=production \
  -p 3018:3018 \
  --restart unless-stopped \
  premarket-strategy
```

---

## Troubleshooting

### Common Issues & Solutions

#### WebSocket Not Connecting
```bash
# Check if port is accessible
curl http://server:3018/ws

# Verify NODE_ENV
docker exec premarket-strategy env | grep NODE_ENV

# Check logs
docker logs premarket-strategy | grep WebSocket
```

#### Stocks Not Categorizing
- Allow 1-2 minutes for momentum data
- Check browser console for errors
- Verify `/api/rockets/scan` returns data

#### Discord Alerts Not Working
1. Check webhook URL format
2. Verify alerts enabled in admin
3. Check price vs threshold
4. View server logs for errors

#### Momentum Shows 0.00
- Fixed in latest update
- Clear browser cache if persists
- Check WebSocket data structure

### Log Monitoring

```bash
# Docker logs
docker logs --tail 100 -f premarket-strategy

# Important log patterns
✅ Success operations
⚠️ Warnings (price threshold skips)
❌ Errors needing attention
🚀 Rocket alerts sent
📈 Price updates broadcast
```

---

## Technical Details

### Momentum Tracking System

The system maintains price history for accurate momentum calculation:

#### Price History Management
```javascript
// Price history structure
const priceHistory = new Map(); // symbol -> array of {price, timestamp, volume}

// Adding price points (every 2 seconds via WebSocket)
function addPriceHistory(symbol, price, volume) {
    if (!priceHistory.has(symbol)) {
        priceHistory.set(symbol, []);
    }
    const history = priceHistory.get(symbol);
    
    // Add new entry
    history.unshift({ price, timestamp: Date.now(), volume });
    
    // Keep last 10 minutes of data (300 entries at 2-second intervals)
    if (history.length > 300) {
        history.pop();
    }
}
```

#### Momentum Calculation Algorithm

1. **Data Collection**: Price snapshots every 2 seconds
2. **Time Window Matching**: Progressive search strategy
   - Primary window: 50-70s (1m), 280-320s (5m)
   - Secondary window: 40-90s (1m), 240-360s (5m)
   - Fallback: Find closest available entry

3. **Percentage Calculation**:
```javascript
priceChange1m = ((currentPrice - oneMinAgoPrice) / oneMinAgoPrice) * 100;
priceChange5m = ((currentPrice - fiveMinAgoPrice) / fiveMinAgoPrice) * 100;
```

#### Real-Time Update Flow

1. **Server-Side Broadcasting** (every 2 seconds):
   - Fetch current price snapshots
   - Calculate momentum from price history
   - Broadcast via WebSocket to all clients

2. **Client-Side Reception**:
   - Receive WebSocket updates
   - Update DOM with price flash animation
   - Preserve momentum values if not provided
   - Trigger re-categorization if thresholds crossed

3. **Full Rocket Scan** (every 30 seconds):
   - Comprehensive market scan
   - Fresh categorization with momentum data
   - Discord alerts for new movers

### Stock Categorization Engine

#### Three-Tier Classification System

1. **🚀 Momentum Leaders**
   - Positive 1-minute momentum (>0.1%)
   - Not declining over 5 minutes
   - OR: Day gain >50% (immediate classification)
   - OR: Day gain >25% with >5M volume

2. **⏸️ Consolidating**
   - Minimal price movement (<0.1% per minute)
   - Sideways action indicating potential breakout
   - Default category for uncertain movements

3. **📉 Pullbacks**
   - Negative 1-minute momentum (<-0.1%)
   - Stocks cooling off from recent highs
   - Potential reversal candidates

#### Smart Categorization Logic

```javascript
// Categorization with momentum data
if (hasMomentumData) {
    if (priceChange1m > 0.1 && (!priceChange5m || priceChange5m > 0)) {
        // Rising with positive momentum
        category = 'momentumLeaders';
    } else if (priceChange1m < -0.1) {
        // Falling momentum
        category = 'pullbacks';
    } else {
        // Sideways movement
        category = 'consolidating';
    }
}
// Categorization without momentum data (initial load)
else {
    if (dayChange >= 50) {
        // Extreme movers always leaders
        category = 'momentumLeaders';
    } else if (dayChange >= 25 && volume > 5000000) {
        // High volume breakouts
        category = 'momentumLeaders';
    } else if (dayChange < -5) {
        // Significant decline
        category = 'pullbacks';
    } else {
        // Default to consolidating
        category = 'consolidating';
    }
}
```

### File Structure
```
/PreMarket_Strategy/
├── premarket-server.js        # Backend server
├── rocket-scanner.html        # Main dashboard
├── admin.html                 # Admin panel
├── index.html                 # Landing page
├── package.json              # Dependencies
├── Dockerfile                # Docker config
├── deploy.sh                 # Deploy script
├── start-local.sh            # Dev startup
├── admin-settings.json       # Settings file
├── screenshots/              # Documentation images
├── .env.local               # Dev environment
├── .env.production          # Prod environment
└── SYSTEM_DOCUMENTATION.md   # This file
```

### Dependencies
```json
{
  "express": "^4.19.2",
  "cors": "^2.8.5",
  "ws": "^8.18.0",
  "axios": "^1.7.7",
  "dotenv": "^16.4.5"
}
```

### Environment Variables
```bash
# Development (.env.local)
NODE_ENV=development
DISCORD_WEBHOOK_ROCKET=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_NEWS=https://discord.com/api/webhooks/...

# Production (.env.production)  
NODE_ENV=production
# Same structure
```

### Performance Optimizations

1. **WebSocket Throttling**: Updates every 2 seconds
2. **Scan Intervals**: Rockets scan every 30 seconds
3. **DOM Batching**: Updates grouped for efficiency
4. **Alert Deduplication**: Prevents spam
5. **Smart Caching**: Different TTLs for data types

### Resource Usage
- Memory: ~100-200MB typical
- CPU: Low, spikes during scans
- Network: Lightweight WebSocket traffic
- Storage: Minimal (settings file only)

---

## Quick Reference

### Key URLs
- Production: `http://15.204.86.6:3018`
- Admin Panel: `http://15.204.86.6:3018/admin.html`
- Local Dev: `http://localhost:3018`

### Essential Commands
```bash
# Check status
docker ps | grep premarket

# View logs
docker logs -f premarket-strategy

# Restart
docker restart premarket-strategy

# Redeploy
git pull && ./deploy.sh

# Test API
curl http://localhost:3018/api/rockets/scan
```

### Important Notes
1. **Always** test in development first
2. **Change** default admin password in production
3. **Monitor** Discord webhook rate limits
4. **Check** logs after deployment
5. **Backup** admin-settings.json regularly

---

*Last Updated: Current Session*
*Version: 2.1 - Real-time WebSocket with Smart Categorization*
*Repository: /mnt/d/Cursor Ideas/PreMarket_Stratedy/*