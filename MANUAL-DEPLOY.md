# Manual Production Deployment Guide

## Quick Fix Deployment (No Cache)

### Option 1: Using the Script (Recommended)
```bash
# Make sure you have SSH access configured, then run:
./rebuild-production.sh
```

### Option 2: Manual Steps

#### Step 1: Connect to Production Server
```bash
ssh root@daily3club.com
```

#### Step 2: Navigate to App Directory
```bash
cd /opt/premarket-scanner
```

#### Step 3: Backup Current File
```bash
cp unified-scanner.js unified-scanner.js.backup.$(date +%Y%m%d-%H%M%S)
```

#### Step 4: Stop PM2 Service
```bash
pm2 stop market-scanner
pm2 delete market-scanner
```

#### Step 5: Clear Ports (if needed)
```bash
sudo fuser -k 3050/tcp
sudo fuser -k 3051/tcp
```

#### Step 6: Upload the Fixed File
From your local machine (in a new terminal):
```bash
cd "/mnt/d/Cursor Ideas/PreMarket_Stratedy"
scp unified-scanner.js root@daily3club.com:/opt/premarket-scanner/unified-scanner.js
```

#### Step 7: Reinstall Dependencies (Clear Cache)
Back on the production server:
```bash
rm -rf node_modules package-lock.json
npm install --production
```

#### Step 8: Start Fresh PM2 Service
```bash
pm2 start unified-scanner.js --name market-scanner \
    --max-memory-restart 1G \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --merge-logs \
    --time

pm2 save
```

#### Step 9: Verify Deployment
```bash
# Check PM2 status
pm2 list

# View logs for errors
pm2 logs market-scanner --lines 50

# Test API endpoint
curl http://localhost:3050/api/gainers | head -c 200
```

#### Step 10: Check Production Site
Open in browser:
- https://daily3club.com
- https://daily3club.com/volume

Look for:
- ✅ Data updating every second
- ✅ No "Cannot access 'movers' before initialization" errors in console
- ✅ Price changes showing in real-time
- ✅ Buy pressure indicators updating

## What Was Fixed

**File**: `unified-scanner.js` line 715-738

**Problem**: Temporal dead zone error where `movers` variable was accessed before initialization
```javascript
// OLD (BROKEN):
let movers = topGainersCache.map(stock => {
    // ...
    if (label === '30s' && Math.abs(change) > 0.1 && movers.indexOf(stock) < 5) {
        //                                              ^^^^^^ Error here!
```

**Solution**: Use map's index parameter instead
```javascript
// NEW (FIXED):
let movers = topGainersCache.map((stock, index) => {
    // ...
    if (label === '30s' && Math.abs(change) > 0.1 && index < 5) {
        //                                              ^^^^^ Fixed!
```

## Troubleshooting

### If PM2 won't start:
```bash
pm2 logs market-scanner --lines 100
```

### If ports are in use:
```bash
sudo lsof -i :3050
sudo lsof -i :3051
# Kill processes if needed
sudo fuser -k 3050/tcp
sudo fuser -k 3051/tcp
```

### If still seeing errors:
```bash
# Full restart
pm2 delete market-scanner
killall node
pm2 start unified-scanner.js --name market-scanner
```

## Monitoring Commands

```bash
# Live logs
pm2 logs market-scanner

# Monitor resource usage
pm2 monit

# Status
pm2 status

# Restart
pm2 restart market-scanner

# Stop
pm2 stop market-scanner
```
