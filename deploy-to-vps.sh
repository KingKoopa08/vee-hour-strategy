#!/bin/bash

# VPS Deployment Script for Rocket Scanner
# Run this on your VPS after pulling latest code

echo "🚀 DEPLOYING ROCKET SCANNER TO PRODUCTION"
echo "========================================="
echo ""

# VPS details
VPS_IP="15.204.86.6"
VPS_USER="root"
REPO_PATH="/root/PreMarket_Strategy"

echo "📍 VPS: $VPS_IP"
echo "📂 Path: $REPO_PATH"
echo ""

# Commands to run on VPS
echo "Steps to deploy on VPS:"
echo ""
echo "1. SSH into VPS:"
echo "   ssh $VPS_USER@$VPS_IP"
echo ""
echo "2. Navigate to project:"
echo "   cd $REPO_PATH"
echo ""
echo "3. Pull latest changes:"
echo "   git pull origin main"
echo ""
echo "4. Install any new dependencies:"
echo "   npm install"
echo ""
echo "5. Copy Discord webhook settings:"
echo "   # The admin-settings.json file should persist"
echo ""
echo "6. Stop existing Docker container:"
echo "   docker stop premarket-strategy"
echo "   docker rm premarket-strategy"
echo ""
echo "7. Rebuild Docker image:"
echo "   docker build --no-cache -t premarket-strategy ."
echo ""
echo "8. Run new container:"
echo "   docker run -d --name premarket-strategy -p 3018:3018 --restart unless-stopped premarket-strategy"
echo ""
echo "9. Check logs:"
echo "   docker logs -f premarket-strategy"
echo ""
echo "10. Test endpoints:"
echo "   curl http://localhost:3018/api/rockets/scan"
echo ""

echo "🔍 New Features Deployed:"
echo "  ✅ Rocket Scanner with Discord alerts"
echo "  ✅ Admin panel at /admin.html (password: rocket123)"
echo "  ✅ Market session auto-detection"
echo "  ✅ Pre-market/After-hours data switching"
echo "  ✅ Enhanced news aggregation"
echo "  ✅ Persistent settings storage"
echo ""

echo "📱 Access URLs:"
echo "  Main: http://$VPS_IP:3018"
echo "  Rocket Scanner: http://$VPS_IP:3018/rocket-scanner.html"
echo "  Admin Panel: http://$VPS_IP:3018/admin.html"
echo ""

echo "⚠️ IMPORTANT:"
echo "  - Configure Discord webhooks in admin panel"
echo "  - Scanner runs every 30 seconds during market hours"
echo "  - Check Discord for rocket alerts!"
echo ""

# Quick deploy command (copy and run on VPS)
echo "============================================"
echo "QUICK DEPLOY (run on VPS):"
echo "============================================"
cat << 'EOF'
cd /root/PreMarket_Strategy && \
git pull origin main && \
npm install && \
docker stop premarket-strategy && \
docker rm premarket-strategy && \
docker build --no-cache -t premarket-strategy . && \
docker run -d --name premarket-strategy -p 3018:3018 --restart unless-stopped premarket-strategy && \
docker logs -f premarket-strategy
EOF