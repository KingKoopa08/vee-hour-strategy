# WebSocket Fix - Production Deployment

## Problem Identified

**Root Cause**: Nginx is configured for Docker deployment, but production uses PM2. The WebSocket proxy points to `market-scanner:3051` (Docker service) instead of `localhost:3051` (PM2 process).

**Symptoms**:
- ✅ Backend running correctly (no errors, data updating)
- ❌ No client connections in logs (no "👤 Client connected" messages)
- ❌ No WebSocket broadcasts happening
- ❌ Frontend showing stale data

**Solution**: Update nginx configuration to point to localhost instead of Docker service.

---

## Deployment Steps

### Step 1: Commit and Push Changes

```bash
cd "/mnt/d/Cursor Ideas/PreMarket_Stratedy"

git add nginx.conf fix-nginx-websocket.sh WEBSOCKET-FIX-DEPLOY.md
git commit -m "Fix: Update nginx config for PM2 deployment

- Changed upstream servers from Docker (market-scanner:*) to PM2 (localhost:*)
- WebSocket proxy now points to localhost:3051 instead of market-scanner:3051
- Created fix-nginx-websocket.sh script for automated deployment
- Fixes issue where frontend doesn't receive WebSocket updates"

git push origin main
```

### Step 2: Deploy on Production

SSH into production server:

```bash
ssh root@daily3club.com
```

Run these commands:

```bash
# Navigate to app directory
cd /opt/premarket-scanner

# Pull latest changes
git pull origin main

# Run nginx fix script
./fix-nginx-websocket.sh
```

The script will automatically:
1. ✅ Backup current nginx config
2. ✅ Copy new config with localhost upstream
3. ✅ Test nginx configuration
4. ✅ Reload nginx
5. ✅ Verify WebSocket port is listening

---

## Verification

### 1. Check PM2 Logs for Client Connections

After deployment, you should see client connection messages:

```bash
pm2 logs market-scanner --lines 30
```

**Look for**:
```
👤 Client connected. Total: 1
📡 Broadcasted volumeMovers to 1 clients
```

### 2. Test WebSocket in Browser

Open: https://daily3club.com/volume

Open browser console (F12) and look for:
```
Connected to WebSocket
📨 [HH:MM:SS] WebSocket message received at :XXs
```

### 3. Verify Data Updates

- Data should update every second
- Price changes should reflect in real-time
- Buy pressure indicators should update

---

## What Changed

### nginx.conf (lines 1-7)

**Before (Docker config)**:
```nginx
upstream market-scanner {
    server market-scanner:3050;
}

upstream websocket {
    server market-scanner:3051;
}
```

**After (PM2 config)**:
```nginx
upstream market-scanner {
    server localhost:3050;
}

upstream websocket {
    server localhost:3051;
}
```

---

## Troubleshooting

### If WebSocket still not connecting:

**Check if port 3051 is listening:**
```bash
netstat -tlnp | grep 3051
# or
ss -tlnp | grep 3051
```

Should show:
```
tcp6  0  0 :::3051  :::*  LISTEN  12345/node
```

**Check nginx error logs:**
```bash
sudo tail -f /var/log/nginx/error.log
```

**Check nginx is using the new config:**
```bash
sudo nginx -T | grep -A 10 "upstream websocket"
```

Should show:
```nginx
upstream websocket {
    server localhost:3051;
}
```

**Restart services if needed:**
```bash
# Restart PM2
pm2 restart market-scanner

# Restart nginx
sudo systemctl restart nginx
```

### If script fails:

**Manual deployment:**
```bash
cd /opt/premarket-scanner

# Backup
sudo cp /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-available/daily3club.com.backup

# Copy new config
sudo cp nginx.conf /etc/nginx/sites-available/daily3club.com

# Test
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

---

## Summary

**Issue**: nginx.conf was configured for Docker but production uses PM2
**Fix**: Changed upstream servers from Docker service names to localhost
**Deploy**: Run `./fix-nginx-websocket.sh` on production after git pull
**Verify**: Check for "👤 Client connected" in PM2 logs and real-time updates in browser

Once deployed, WebSocket connections will work and data will update in real-time!
