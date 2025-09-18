#!/bin/bash

# Deploy Volume Movers Feature to VPS
echo "🚀 Deploying Volume Movers Scanner to VPS"
echo "========================================="

# Configuration
VPS_IP="15.204.86.6"
VPS_USER="root"
VPS_DIR="/opt/vee-hour-strategy"

# 1. Push to GitHub first
echo ""
echo "📤 Step 1: Pushing to GitHub..."
git push origin main

echo ""
echo "📥 Step 2: Deploying to VPS..."
echo "Run these commands on your VPS:"
echo ""
echo "ssh $VPS_USER@$VPS_IP"
echo ""
echo "# Once connected to VPS, run:"
cat << 'EOF'
cd /opt/vee-hour-strategy

# Pull latest changes
git pull

# Restart PM2 process
pm2 restart market-scanner

# Check status
pm2 status market-scanner

# View recent logs
pm2 logs market-scanner --lines 20

# Test the new Volume Movers page
curl -s http://localhost:3050/volume > /dev/null && echo "✅ Volume Movers page responding" || echo "❌ Volume Movers page not responding"
EOF

echo ""
echo "========================================="
echo "📍 Access URLs:"
echo "  Volume Movers: http://$VPS_IP:3050/volume"
echo "  Main Hub: http://$VPS_IP:3050"
echo "  Top Gainers: http://$VPS_IP:3050/gainers"
echo "  Rising Stocks: http://$VPS_IP:3050/rising"
echo ""
echo "✅ Deployment script ready!"
echo ""
echo "To deploy, SSH into your VPS and run the commands above."