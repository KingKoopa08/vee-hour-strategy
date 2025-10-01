# Git-Based Deployment (Easiest Method)

Since SSH authentication is needed for the automated script, the easiest way to deploy is via Git.

## Step 1: Commit the Fix Locally

```bash
cd "/mnt/d/Cursor Ideas/PreMarket_Stratedy"

git add unified-scanner.js
git commit -m "Fix: Resolve 'Cannot access movers before initialization' error

- Changed map function to use index parameter instead of movers.indexOf()
- Fixes temporal dead zone error on line 738
- Tested locally - data refreshing properly"

git push origin main
```

## Step 2: Deploy on Production Server

SSH into your production server and run:

```bash
ssh root@daily3club.com
```

Then execute these commands:

```bash
# Navigate to app directory
cd /opt/premarket-scanner

# Backup current version
cp unified-scanner.js unified-scanner.js.backup.$(date +%Y%m%d-%H%M%S)

# Pull latest changes
git pull origin main

# Stop PM2 service
pm2 stop market-scanner
pm2 delete market-scanner

# Clear cached modules (IMPORTANT!)
rm -rf node_modules package-lock.json

# Reinstall dependencies fresh
npm install --production

# Start fresh service
pm2 start unified-scanner.js --name market-scanner \
    --max-memory-restart 1G \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --merge-logs \
    --time

# Save PM2 configuration
pm2 save

# Check logs for errors
pm2 logs market-scanner --lines 50
```

## Step 3: Verify Deployment

### Check PM2 Status
```bash
pm2 status
```

### Test API
```bash
curl http://localhost:3050/api/gainers | head -c 200
```

### Check for Errors
```bash
pm2 logs market-scanner --lines 100 | grep -i "error\|cannot access"
```

Should show NO "Cannot access 'movers' before initialization" errors!

### Open in Browser
- https://daily3club.com
- https://daily3club.com/volume

Look for:
- ✅ Data updating every second
- ✅ Price changes showing
- ✅ Buy pressure indicators working
- ✅ No console errors

## Alternative: One-Line Deploy Command

If you have SSH access configured, run this from production server:

```bash
cd /opt/premarket-scanner && \
git pull && \
pm2 stop market-scanner && \
pm2 delete market-scanner && \
rm -rf node_modules package-lock.json && \
npm install --production && \
pm2 start unified-scanner.js --name market-scanner --max-memory-restart 1G && \
pm2 save && \
pm2 logs market-scanner --lines 30
```

## What Changed

**File**: `unified-scanner.js`
**Lines**: 715, 738

**Before**:
```javascript
let movers = topGainersCache.map(stock => {
    // ... code ...
    if (label === '30s' && Math.abs(change) > 0.1 && movers.indexOf(stock) < 5) {
        // ERROR: movers not defined yet!
```

**After**:
```javascript
let movers = topGainersCache.map((stock, index) => {
    // ... code ...
    if (label === '30s' && Math.abs(change) > 0.1 && index < 5) {
        // FIXED: use index parameter
```

## Troubleshooting

### If git pull shows conflicts:
```bash
git stash
git pull
```

### If PM2 won't start:
```bash
pm2 logs market-scanner
# Look for specific error
```

### If ports still in use:
```bash
sudo fuser -k 3050/tcp
sudo fuser -k 3051/tcp
pm2 start unified-scanner.js --name market-scanner
```

### Complete fresh restart:
```bash
pm2 delete market-scanner
killall node
cd /opt/premarket-scanner
git pull
npm install --production
pm2 start unified-scanner.js --name market-scanner
pm2 save
```
