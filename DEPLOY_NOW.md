# 🚀 DEPLOY ROCKET SCANNER FIX

## Quick Deploy (Run on VPS)

SSH into your VPS and run:

```bash
cd /opt/vee-hour-strategy && \
git pull origin main && \
docker stop premarket-strategy && \
docker rm premarket-strategy && \
docker build --no-cache -t premarket-strategy . && \
docker run -d --name premarket-strategy -p 3018:3018 --restart unless-stopped premarket-strategy && \
echo "✅ Deployment Complete!" && \
docker logs --tail 20 premarket-strategy
```

## What Was Fixed

1. **Field Name Compatibility**: Fixed handling of `priceChangePercent` vs `changePercent` fields
2. **Loading Indicator**: Added "Scanning for rockets..." message while loading
3. **Fallback Logic**: When no rockets detected, falls back to top-volume stocks
4. **Display Logic**: Properly normalizes fields before displaying
5. **Filter Logic**: Fixed percentage change filtering to work with both field names

## Test After Deploy

Visit: http://15.204.86.6:3018/rocket-scanner.html

You should now see:
- FGI with +83.8% gain
- TANH with +16.1% gain  
- Other high-volume stocks

## If Still Not Working

1. Check the API directly:
   ```bash
   curl http://localhost:3018/api/stocks/top-volume
   ```

2. Check container logs:
   ```bash
   docker logs -f premarket-strategy
   ```

3. Verify the file was updated:
   ```bash
   docker exec premarket-strategy grep -n "Normalize field names" /app/rocket-scanner.html
   ```