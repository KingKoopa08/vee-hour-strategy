# Production Deployment Instructions

## Overview
A deployment script `deploy-fix.sh` has been created and pushed to the repository. This script will:
- ✅ Backup current version
- ✅ Stop PM2 service
- ✅ Clear ports and cache
- ✅ Reinstall dependencies fresh
- ✅ Start service with fix
- ✅ Verify deployment

## Deployment Steps

### 1. SSH into Production Server
```bash
ssh root@daily3club.com
```

### 2. Navigate to App Directory
```bash
cd /opt/premarket-scanner
```

### 3. Pull Latest Code
```bash
git pull origin main
```

You should see:
- `deploy-fix.sh` updated or created
- `unified-scanner.js` updated (with the fix)

### 4. Run Deployment Script
```bash
./deploy-fix.sh
```

The script will automatically:
1. Backup your current `unified-scanner.js`
2. Stop the `market-scanner` PM2 service
3. Clear ports 3050 and 3051
4. Remove `node_modules` and `package-lock.json` (clear cache)
5. Run `npm install --production`
6. Start fresh PM2 service
7. Verify deployment is working
8. Show recent logs

### 5. Verify Deployment

The script will automatically verify, but you should also:

**Check the website:**
- Open: https://daily3club.com
- Verify: Data updating every second
- Check: Browser console for errors (should be none)
- Open: https://daily3club.com/volume
- Verify: Volume movers updating

**Check logs manually if needed:**
```bash
pm2 logs market-scanner --lines 50
```

Look for:
- ✅ No "Cannot access 'movers' before initialization" errors
- ✅ "Broadcasting at :XXs with 200 stocks" messages
- ✅ API updates completing successfully

## What Was Fixed

**File:** `unified-scanner.js` line 715
**Error:** `Cannot access 'movers' before initialization`

**Before:**
```javascript
let movers = topGainersCache.map(stock => {
    // ...
    if (label === '30s' && Math.abs(change) > 0.1 && movers.indexOf(stock) < 5) {
```

**After:**
```javascript
let movers = topGainersCache.map((stock, index) => {
    // ...
    if (label === '30s' && Math.abs(change) > 0.1 && index < 5) {
```

## Troubleshooting

### If script fails to run:
```bash
chmod +x deploy-fix.sh
./deploy-fix.sh
```

### If deployment fails:
Check the logs shown by the script, or manually:
```bash
pm2 logs market-scanner --lines 100
```

### To manually restart if needed:
```bash
pm2 restart market-scanner
```

### To rollback if needed:
```bash
# List backups
ls -la unified-scanner.js.backup.*

# Restore from backup (use latest timestamp)
cp unified-scanner.js.backup.YYYYMMDD-HHMMSS unified-scanner.js
pm2 restart market-scanner
```

## Expected Output

When successful, you should see:
```
============================================
✅ DEPLOYMENT SUCCESSFUL!
============================================

Your scanner is now running with the fix!

Next steps:
  1. Open: https://daily3club.com
  2. Verify data is updating every second
  3. Check browser console for errors (should be none)
```

## Monitoring Commands

```bash
# View live logs
pm2 logs market-scanner

# Monitor resources
pm2 monit

# Check status
pm2 status

# Restart if needed
pm2 restart market-scanner

# Stop if needed
pm2 stop market-scanner
```

## Summary

1. `ssh root@daily3club.com`
2. `cd /opt/premarket-scanner`
3. `git pull origin main`
4. `./deploy-fix.sh`
5. Verify at https://daily3club.com

That's it! The script handles everything else automatically.
