# 📊 daily3club.com - Complete System Documentation

> **Live Site**: https://daily3club.com
> **Server IP**: 15.204.86.6 (OVH VPS)
> **Repository**: https://github.com/KingKoopa08/vee-hour-strategy

---

## 📑 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Configuration](#configuration)
4. [Development Workflow](#development-workflow)
5. [Deployment Process](#deployment-process)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## 🎯 System Overview

### What is daily3club.com?

A **real-time stock market scanner** that tracks:
- Top gainers with WebSocket live updates
- Volume movers across multiple timeframes (30s, 1m, 2m, 3m, 5m)
- Price/volume changes with buy pressure indicators
- Market session awareness (Pre-market, Regular Hours, After-hours)

### Key Features

- ✅ Real-time WebSocket updates (1 second intervals)
- ✅ Multi-timeframe volume/price analysis
- ✅ Buy pressure calculation algorithm
- ✅ Session-specific volume tracking
- ✅ Trading status detection (ACTIVE/HALTED/SUSPENDED)
- ✅ Position change tracking (5-minute window)

---

## 🏗 Architecture

### Production Stack

```
┌─────────────────────────────────────────────────────┐
│                  daily3club.com                      │
│                   (Cloudflare)                       │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│         OVH VPS (15.204.86.6 - Debian)              │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Docker Nginx (market-nginx)               │    │
│  │  - Ports: 80, 443                          │    │
│  │  - SSL: Cloudflare                         │    │
│  │  - Network: market-network                 │    │
│  └──────┬──────────────────────────┬──────────┘    │
│         │                           │                │
│         │ HTTP (:3050)              │ WS (:3051)    │
│         ▼                           ▼                │
│  ┌────────────────────────────────────────────┐    │
│  │  Node.js Scanner (PM2: market-scanner)     │    │
│  │  - File: unified-scanner.js                │    │
│  │  - HTTP Port: 3050                         │    │
│  │  - WebSocket Port: 3051                    │    │
│  │  - Gateway IP: 172.19.0.1 (host access)    │    │
│  └────────────────────────────────────────────┘    │
│                                                      │
│  External APIs:                                     │
│  └─→ Polygon.io (Real-time market data)            │
└─────────────────────────────────────────────────────┘
```

### Network Configuration

#### Docker Network
- **Name**: `market-network`
- **Type**: Bridge
- **Gateway IP**: `172.19.0.1` (used for Docker → Host communication)

#### Nginx → Backend Communication
```nginx
# Nginx config uses Docker gateway IP to reach host services
upstream backend {
    server 172.19.0.1:3050;
}

upstream websocket {
    server 172.19.0.1:3051;
}
```

**Why Gateway IP?**
- Docker containers can't use `localhost` or `127.0.0.1` to reach host
- `172.19.0.1` is the Docker bridge gateway that routes to host services
- PM2 runs on the host, NOT in Docker

### File Structure

```
/home/debian/PreMarket_Stratedy/
├── unified-scanner.js           # Main backend server
├── volume-movers-page.html      # Frontend page for /volume
├── whales-page.html             # Frontend page for /whales
├── .env                         # Environment variables
├── package.json                 # Node dependencies
│
├── DAILY3CLUB-DOCUMENTATION.md  # This file
├── fix-nginx-final.sh           # Fix nginx gateway IP
├── deploy-production.sh         # Main deployment script
│
└── nginx/                       # Docker nginx config
    └── default.conf             # Reverse proxy config
```

---

## ⚙️ Configuration

### Environment Variables

**File**: `.env`

```bash
# Polygon.io API
POLYGON_API_KEY=AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW

# Server Ports
PORT=3050          # HTTP API
WS_PORT=3051       # WebSocket

# Environment
NODE_ENV=production
```

### Docker Nginx Configuration

**Container**: `market-nginx`
**Image**: `nginx:latest`
**Network**: `market-network`

**Config Location**: `/etc/nginx/conf.d/default.conf` (inside container)

```nginx
upstream backend {
    server 172.19.0.1:3050;  # Gateway IP for host access
}

upstream websocket {
    server 172.19.0.1:3051;
}

server {
    listen 80;
    listen 443 ssl;
    server_name daily3club.com www.daily3club.com;

    # HTTP routes
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket route
    location /ws {
        proxy_pass http://websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### PM2 Process Configuration

**Process Name**: `market-scanner`
**File**: `unified-scanner.js`
**Restart**: Always
**Max Memory**: 1GB

```bash
pm2 start unified-scanner.js --name market-scanner \
    --max-memory-restart 1G \
    --log-date-format="YYYY-MM-DD HH:mm:ss"
```

### Port Configuration

| Service | Port | Protocol | Access |
|---------|------|----------|--------|
| Docker Nginx | 80 | HTTP | Public |
| Docker Nginx | 443 | HTTPS | Public (Cloudflare) |
| Node.js API | 3050 | HTTP | Host only |
| WebSocket | 3051 | WS | Host only |

---

## 🛠 Development Workflow

### Best Practices

#### ✅ DO:
1. **Work locally first** - Test everything on your local machine
2. **Use deployment scripts** - Never run one-off commands in production
3. **Git workflow** - Commit → Push → Pull on server → Deploy
4. **Test before deploy** - Run local scanner and verify functionality
5. **Monitor logs** - Check PM2 logs after every deployment

#### ❌ DON'T:
1. **No manual production edits** - Always deploy via scripts
2. **No direct file edits on server** - Use git pull
3. **No copy-paste commands** - Create scripts instead
4. **No skipping local testing** - Catch bugs before production

### Local Development

#### 1. Start Local Scanner

```bash
cd /mnt/d/Cursor\ Ideas/PreMarket_Stratedy

# Kill any existing scanner
pkill -f "node unified-scanner"

# Start fresh
node unified-scanner.js > scanner-output.log 2>&1 &

# Check logs
tail -f scanner-output.log
```

#### 2. Access Local Site

- **Scanner Home**: http://localhost:3050
- **Top Gainers**: http://localhost:3050/gainers
- **Volume Movers**: http://localhost:3050/volume
- **Whale Detector**: http://localhost:3050/whales
- **API**: http://localhost:3050/api/gainers
- **WebSocket**: ws://localhost:3051

#### 3. Test Changes

```bash
# Check API response
curl http://localhost:3050/api/gainers | head -c 500

# Monitor WebSocket connections
tail -f scanner-output.log | grep "Client connected"

# Check for errors
tail -f scanner-output.log | grep "Error"
```

#### 4. Common Local Issues

**Port Already in Use**:
```bash
# Find and kill process
lsof -i :3050
pkill -f "node unified-scanner"
```

**Syntax Errors**:
```bash
# Node.js may cache files - clear cache
rm -rf ~/.node_gyp ~/.npm ~/.cache/node
pkill -9 node
```

**WebSocket Not Connecting**:
```bash
# Check if WS port is listening
netstat -tulpn | grep 3051
```

---

## 🚀 Deployment Process

### Overview

Our deployment philosophy:
- **Script everything** - No manual commands
- **Git-based** - Single source of truth
- **Idempotent** - Scripts can run multiple times safely
- **Logged** - All actions recorded with timestamps

### Deployment Scripts

#### Main Deployment Script: `deploy-production.sh`

```bash
#!/bin/bash

# Complete production deployment
# Usage: ./deploy-production.sh

cd /home/debian/PreMarket_Stratedy

echo "🚀 Starting deployment..."

# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install

# 3. Restart PM2 scanner
pm2 restart market-scanner || pm2 start unified-scanner.js --name market-scanner

# 4. Check Docker nginx
docker ps | grep market-nginx || docker start market-nginx

# 5. Verify
sleep 3
pm2 logs market-scanner --lines 20

echo "✅ Deployment complete!"
```

#### Nginx Fix Script: `fix-nginx-final.sh`

```bash
#!/bin/bash

# Fix Docker nginx to use gateway IP for host communication
# This script ensures nginx can reach PM2 services on the host

set -e

DOCKER_NGINX="market-nginx"
CONFIG_FILE="/etc/nginx/conf.d/default.conf"

echo "🔧 FIXING NGINX → GATEWAY IP"

# Get gateway IP
GATEWAY_IP=$(docker exec "$DOCKER_NGINX" ip route | grep default | awk '{print $3}')
echo "✅ Gateway IP: $GATEWAY_IP"

# Show current config
echo "Current upstream configuration:"
docker exec "$DOCKER_NGINX" grep -A 1 "upstream" "$CONFIG_FILE"

# Backup
docker exec "$DOCKER_NGINX" cp "$CONFIG_FILE" "${CONFIG_FILE}.backup.$(date +%Y%m%d-%H%M%S)"

# Update to use gateway IP
docker exec "$DOCKER_NGINX" sh -c "sed -e 's/server market-scanner:3050/server $GATEWAY_IP:3050/' \
    -e 's/server market-scanner:3051/server $GATEWAY_IP:3051/' \
    -e 's/server localhost:3050/server $GATEWAY_IP:3050/' \
    -e 's/server localhost:3051/server $GATEWAY_IP:3051/' \
    $CONFIG_FILE > /tmp/default.conf.new && cat /tmp/default.conf.new > $CONFIG_FILE"

echo "New upstream configuration:"
docker exec "$DOCKER_NGINX" grep -A 1 "upstream" "$CONFIG_FILE"

# Test and reload
docker exec "$DOCKER_NGINX" nginx -t && \
    docker exec "$DOCKER_NGINX" nginx -s reload || docker restart "$DOCKER_NGINX"

echo "✅ NGINX FIXED!"
```

### Step-by-Step Deployment

#### 1. Local Development & Testing

```bash
# On your local machine (Windows/WSL)
cd /mnt/d/Cursor\ Ideas/PreMarket_Stratedy

# Make your changes to unified-scanner.js or frontend files

# Test locally
pkill -f "node unified-scanner"
node unified-scanner.js > scanner-output.log 2>&1 &
sleep 5
tail -f scanner-output.log

# Verify functionality
curl http://localhost:3050/api/gainers
# Open http://localhost:3050/volume in browser
```

#### 2. Commit & Push Changes

```bash
# Commit your changes
git add .
git commit -m "Description of changes"

# Push to GitHub
git push origin main
```

#### 3. Deploy to Production

```bash
# SSH to production server
ssh debian@15.204.86.6

# Navigate to project
cd PreMarket_Stratedy

# Run deployment script
./deploy-production.sh

# Monitor deployment
pm2 logs market-scanner --lines 50
```

#### 4. Verify Production

```bash
# Check PM2 status
pm2 status

# Check logs for errors
pm2 logs market-scanner | grep -i error

# Test API
curl http://localhost:3050/api/gainers | head -c 200

# Check WebSocket connections
pm2 logs market-scanner | grep "Client connected"

# Test live site
# Open https://daily3club.com/volume in browser
```

### Quick Deployment Commands

```bash
# Full deployment from GitHub
ssh debian@15.204.86.6 "cd PreMarket_Stratedy && git pull && npm install && pm2 restart market-scanner"

# Restart scanner only
ssh debian@15.204.86.6 "pm2 restart market-scanner"

# Fix nginx gateway IP
ssh debian@15.204.86.6 "cd PreMarket_Stratedy && ./fix-nginx-final.sh"

# View logs
ssh debian@15.204.86.6 "pm2 logs market-scanner --lines 100"
```

---

## 📊 Monitoring & Maintenance

### Daily Checks

```bash
# SSH to server
ssh debian@15.204.86.6

# Check scanner status
pm2 status

# Check recent logs
pm2 logs market-scanner --lines 50

# Check for errors in last hour
pm2 logs market-scanner --lines 1000 | grep -i error

# Check WebSocket connections
pm2 logs market-scanner --lines 100 | grep "Client connected"

# Check Docker nginx
docker ps | grep market-nginx
```

### Performance Monitoring

```bash
# PM2 monitoring dashboard
pm2 monit

# Memory usage
pm2 info market-scanner | grep -i memory

# CPU usage
top -p $(pgrep -f "unified-scanner")

# Disk usage
df -h
```

### Log Management

```bash
# View real-time logs
pm2 logs market-scanner

# Search logs for specific stock
pm2 logs market-scanner | grep "AAPL"

# Check for price change issues
pm2 logs market-scanner | grep "30s-change"

# View only errors
pm2 logs market-scanner --err

# Clear old logs
pm2 flush market-scanner
```

### Health Checks

```bash
# API health check
curl http://localhost:3050/api/gainers | head -c 100

# WebSocket health check
pm2 logs market-scanner --lines 20 | grep "Broadcasted"

# Nginx health check
docker exec market-nginx nginx -t

# Full system check
./diagnose-full-system.sh
```

---

## 🔧 Troubleshooting

### Issue: Scanner Not Starting

**Symptoms**: PM2 shows "errored" or constantly restarting

**Debug Steps**:
```bash
# Check syntax errors
node unified-scanner.js

# Check logs
pm2 logs market-scanner --lines 100

# Check for port conflicts
lsof -i :3050
lsof -i :3051

# Restart fresh
pm2 delete market-scanner
pm2 start unified-scanner.js --name market-scanner
pm2 save
```

### Issue: WebSocket Not Connecting (Frontend)

**Symptoms**: Console errors "WebSocket connection failed"

**Debug Steps**:
```bash
# Check nginx config
docker exec market-nginx grep -A 5 "location /ws" /etc/nginx/conf.d/default.conf

# Check if using gateway IP
docker exec market-nginx grep "upstream websocket" -A 2 /etc/nginx/conf.d/default.conf

# Should show: server 172.19.0.1:3051

# Fix if wrong
./fix-nginx-final.sh
```

### Issue: 0% Price Changes

**Symptoms**: All price changes show 0.00% despite price movements

**Root Cause**: `priceHistory` filled with duplicate prices from stale cache

**Fix**: Already fixed in unified-scanner.js (line 765)
- History updates ONLY in `getVolumeMovers()` with fresh API data
- NOT updated in `trackHistoricalData()` broadcast loop

**Verification**:
```bash
# Check logs for non-zero price changes
pm2 logs market-scanner --lines 200 | grep "30s-change" | grep -v "0.00%"

# Should see entries like:
# 🎯 MLACR: hist=128 entries, oldest=127s ago, 30s-change=0.02%, BP=57.32
```

### Issue: Site Not Accessible

**Symptoms**: https://daily3club.com returns 502 or timeout

**Debug Steps**:
```bash
# Check if scanner is running
pm2 status

# Check if nginx is running
docker ps | grep market-nginx

# Test API directly
curl http://localhost:3050/api/gainers

# Check nginx logs
docker logs market-nginx --tail 50

# Restart everything
pm2 restart market-scanner
docker restart market-nginx
sleep 5
curl https://daily3club.com/api/gainers
```

### Issue: Docker Nginx Can't Reach Backend

**Symptoms**: Nginx 502 errors, logs show "connect failed"

**Cause**: Nginx trying to use wrong host (localhost, market-scanner, etc.)

**Fix**:
```bash
# Run the nginx fix script
./fix-nginx-final.sh

# This will:
# 1. Get Docker gateway IP (usually 172.19.0.1)
# 2. Update nginx config to use gateway IP
# 3. Reload nginx
# 4. Verify connectivity
```

### Issue: Syntax Error After Code Update

**Symptoms**:
```
SyntaxError: Identifier 'fiveMinutesAgo' has already been declared
```

**Cause**: Node.js caching old bytecode

**Fix**:
```bash
# Clear Node cache
rm -rf ~/.node_gyp ~/.npm ~/.cache/node

# Kill all node processes
pkill -9 -f "node unified-scanner"

# Force file sync (WSL only)
cd /mnt/d/Cursor\ Ideas/PreMarket_Stratedy
touch unified-scanner.js
sync
sleep 2

# Restart
node unified-scanner.js > scanner-output.log 2>&1 &
```

---

## 📋 Best Practices

### 1. Always Use Scripts

**❌ DON'T**:
```bash
# Don't run manual commands
ssh debian@15.204.86.6
cd PreMarket_Stratedy
git pull
pm2 restart market-scanner
# (Easy to forget steps, no logging)
```

**✅ DO**:
```bash
# Use deployment script
ssh debian@15.204.86.6 "cd PreMarket_Stratedy && ./deploy-production.sh"
# (Consistent, logged, repeatable)
```

### 2. Test Locally Before Production

**❌ DON'T**:
```bash
# Don't push untested code
git commit -m "fix"
git push
# Deploy to production
# 🔥 Site breaks
```

**✅ DO**:
```bash
# Test locally first
pkill -f "node unified-scanner"
node unified-scanner.js > scanner-output.log 2>&1 &
tail -f scanner-output.log
# Verify functionality
curl http://localhost:3050/api/gainers
# ✅ Works locally
git commit -m "fix: corrected price history update logic"
git push
# Deploy to production
```

### 3. Use Git for All Changes

**❌ DON'T**:
```bash
# Don't edit files directly on server
ssh debian@15.204.86.6
nano /home/debian/PreMarket_Stratedy/unified-scanner.js
# (Changes lost on next git pull)
```

**✅ DO**:
```bash
# Edit locally, commit, push, pull
# On local machine:
nano unified-scanner.js
git commit -m "update"
git push

# On server:
ssh debian@15.204.86.6
cd PreMarket_Stratedy
git pull
pm2 restart market-scanner
```

### 4. Document Everything

When you create a new script or fix an issue:

```bash
# 1. Create the script
nano fix-new-issue.sh

# 2. Add to git
git add fix-new-issue.sh
git commit -m "Add script to fix [issue description]"

# 3. Document in this file (DAILY3CLUB-DOCUMENTATION.md)
# Add to Troubleshooting section with:
# - What it fixes
# - When to use it
# - Example output
```

### 5. Monitor After Changes

```bash
# After any deployment, always:

# 1. Check PM2 status
pm2 status

# 2. Watch logs for 30 seconds
pm2 logs market-scanner --lines 50

# 3. Test the site
curl https://daily3club.com/api/gainers

# 4. Check browser
# Open https://daily3club.com/volume
# Look for WebSocket connection in console
```

---

## 📞 Quick Reference

### Common Commands

```bash
# === LOCAL DEVELOPMENT ===
# Start local scanner
cd /mnt/d/Cursor\ Ideas/PreMarket_Stratedy
pkill -f "node unified-scanner" && node unified-scanner.js > scanner-output.log 2>&1 &

# Check local logs
tail -f scanner-output.log

# Test local API
curl http://localhost:3050/api/gainers

# === PRODUCTION DEPLOYMENT ===
# Full deployment
ssh debian@15.204.86.6 "cd PreMarket_Stratedy && ./deploy-production.sh"

# Quick restart
ssh debian@15.204.86.6 "pm2 restart market-scanner"

# Fix nginx
ssh debian@15.204.86.6 "cd PreMarket_Stratedy && ./fix-nginx-final.sh"

# === MONITORING ===
# Check status
ssh debian@15.204.86.6 "pm2 status"

# View logs
ssh debian@15.204.86.6 "pm2 logs market-scanner --lines 100"

# Monitor live
ssh debian@15.204.86.6 "pm2 logs market-scanner"

# === TROUBLESHOOTING ===
# Restart everything
ssh debian@15.204.86.6 "pm2 restart market-scanner && docker restart market-nginx"

# Check for errors
ssh debian@15.204.86.6 "pm2 logs market-scanner --lines 500 | grep -i error"
```

### Important Files

| File | Purpose | Location |
|------|---------|----------|
| `unified-scanner.js` | Main backend server | Root |
| `volume-movers-page.html` | Frontend page | Root |
| `.env` | Environment config | Root |
| `deploy-production.sh` | Main deployment | Root |
| `fix-nginx-final.sh` | Fix nginx gateway IP | Root |
| `/etc/nginx/conf.d/default.conf` | Nginx config | Docker container |

### Important URLs

- **Production**: https://daily3club.com
- **Volume Page**: https://daily3club.com/volume
- **API**: https://daily3club.com/api/gainers
- **WebSocket**: wss://daily3club.com/ws
- **GitHub**: https://github.com/KingKoopa08/vee-hour-strategy

### Important IPs & Ports

| Service | IP/Host | Port |
|---------|---------|------|
| VPS | 15.204.86.6 | 22 (SSH) |
| Docker Nginx | Container | 80, 443 |
| Docker Gateway | 172.19.0.1 | - |
| Node.js API | localhost | 3050 |
| WebSocket | localhost | 3051 |

---

## 🔄 Recent Fixes & Updates

### October 2, 2025 - Price Change Fix

**Issue**: Price changes showing 0.00% despite price movements

**Root Cause**:
- `priceHistory` was being updated in `trackHistoricalData()` with stale cached data
- This function runs every 1 second during broadcast intervals
- Was pushing same cached price repeatedly → history filled with duplicates → 0% changes

**Solution**:
- Moved history updates to `getVolumeMovers()` (line 765)
- This function receives FRESH API data
- `trackHistoricalData()` now ONLY reads history for calculations (line 1891-1904)
- Added comments explaining this critical distinction

**Verification**:
```bash
# Local scanner now shows non-zero changes:
# 🎯 MLACR: hist=128 entries, oldest=127s ago, 30s-change=0.02%, BP=57.32
```

### October 2, 2025 - Node.js Cache Issue

**Issue**: Syntax error persisted despite file showing correct code
```
SyntaxError: Identifier 'fiveMinutesAgo' has already been declared
```

**Root Cause**: Node.js caching old bytecode in WSL2 environment

**Solution**:
- Clear all Node.js caches
- Kill all node processes
- Force file system sync
- Restart with fresh Node instance

**Prevention**: Included in troubleshooting guide

---

## 📚 Additional Resources

- **Polygon.io API Docs**: https://polygon.io/docs
- **PM2 Documentation**: https://pm2.keymetrics.io/docs
- **Nginx Docker Hub**: https://hub.docker.com/_/nginx
- **WebSocket Protocol**: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

---

**Last Updated**: October 2, 2025
**Version**: 2.0
**Maintained By**: Development Team

