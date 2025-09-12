# VPS Deployment Instructions

## To Deploy Latest Changes to VPS

Run these commands on your VPS:

```bash
# 1. Navigate to project directory
cd /path/to/vee-hour-strategy

# 2. Pull latest changes from GitHub
git pull origin main

# 3. Deploy with fresh Docker build (no cache)
./deploy.sh
```

The deploy script will:
- Stop and remove old container
- Remove old Docker image
- Build fresh image with --no-cache flag
- Start new container on port 3018

## Verify Deployment

After deployment, check:
1. Landing page: http://15.204.86.6:3018/ (should show "Trading Scanner Hub")
2. Check logs: `docker logs -f premarket-strategy`
3. Verify all dashboards are accessible

## Available Dashboards

- Landing Page: http://15.204.86.6:3018/
- Pre-Market: http://15.204.86.6:3018/premarket-dashboard.html
- Market: http://15.204.86.6:3018/market-dashboard.html
- After-Hours: http://15.204.86.6:3018/afterhours-dashboard.html
- Live Trading: http://15.204.86.6:3018/live-dashboard.html

## Troubleshooting

If the wrong page is still showing:
1. Clear browser cache (Ctrl+F5)
2. Check Docker is using latest image: `docker images | grep premarket`
3. Verify server.js changes: `docker exec premarket-strategy cat premarket-server.js | grep "index.html"`