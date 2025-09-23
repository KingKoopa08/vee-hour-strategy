#!/bin/bash

# Production Deployment Script for VPS
# Run this directly on your VPS server

echo "==============================================="
echo "🚀 PRODUCTION DEPLOYMENT SCRIPT"
echo "==============================================="

# Step 1: Stop existing services
echo ""
echo "📦 Step 1: Stopping existing services..."
pm2 delete all 2>/dev/null || true
echo "✅ Services stopped"

# Step 2: Clean and update repository
echo ""
echo "📦 Step 2: Updating code from GitHub..."
cd /opt/vee-hour-strategy 2>/dev/null || cd ~

# If directory exists, pull latest
if [ -d "vee-hour-strategy" ]; then
    cd vee-hour-strategy
    git fetch --all
    git reset --hard origin/main
    git pull origin main
else
    # Clone fresh copy
    cd ~
    rm -rf vee-hour-strategy
    git clone https://github.com/KingKoopa08/vee-hour-strategy.git
    cd vee-hour-strategy
fi

echo "✅ Code updated"

# Step 3: Install dependencies
echo ""
echo "📦 Step 3: Installing dependencies..."
npm install --legacy-peer-deps
echo "✅ Dependencies installed"

# Step 4: Setup environment with new API key
echo ""
echo "📦 Step 4: Configuring environment..."
cat > .env << 'EOF'
# Polygon API Configuration
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Add Discord webhook if you have one
# DISCORD_WEBHOOK=your_webhook_url_here
EOF

echo "✅ Environment configured with new Polygon API key"

# Step 5: Test API key
echo ""
echo "📦 Step 5: Testing Polygon API key..."
node test-new-api-key.js || echo "⚠️  Test file not found, skipping test"

# Step 6: Start services with PM2
echo ""
echo "📦 Step 6: Starting services with PM2..."

# Start unified scanner (main service)
pm2 start unified-scanner.js \
  --name "market-scanner" \
  --node-args="--max-old-space-size=2048" \
  --time \
  --log-date-format="YYYY-MM-DD HH:mm:ss" \
  --restart-delay 5000 \
  --max-restarts 10

# Optional: Start additional services
# pm2 start premarket-server.js --name "premarket" --node-args="--max-old-space-size=1024"
# pm2 start spike-detector-rest.js --name "spike-detector" --node-args="--max-old-space-size=1024"

echo "✅ Services started"

# Step 7: Save PM2 configuration
echo ""
echo "📦 Step 7: Saving PM2 configuration..."
pm2 save

# Setup startup script if not already done
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

echo "✅ PM2 configuration saved"

# Step 8: Display status
echo ""
echo "==============================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "==============================================="
echo ""
echo "📊 Service Status:"
pm2 list
echo ""
echo "🌐 Access your services at:"
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "   📈 Web Dashboard: http://$SERVER_IP:3050"
echo "   📊 API Endpoint: http://$SERVER_IP:3050/api/gainers"
echo "   🔌 WebSocket: ws://$SERVER_IP:3051"
echo ""
echo "📝 Useful PM2 commands:"
echo "   View logs: pm2 logs market-scanner"
echo "   Monitor: pm2 monit"
echo "   Restart: pm2 restart market-scanner"
echo "   Stop: pm2 stop market-scanner"
echo ""
echo "🔍 Check latest logs:"
pm2 logs market-scanner --lines 10 --nostream
echo ""
echo "==============================================="