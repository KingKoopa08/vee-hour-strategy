#!/bin/bash

# VPS Deployment Script for Market Scanner
# Run this on your VPS server

echo "🚀 Starting VPS Deployment..."

# Clean up any existing deployment
if [ -d "$HOME/vee-hour-strategy" ]; then
    echo "📦 Removing existing installation..."
    pm2 delete market-scanner 2>/dev/null || true
    pm2 delete premarket-server 2>/dev/null || true
    rm -rf $HOME/vee-hour-strategy
fi

# Clone repository
echo "📥 Cloning repository..."
cd $HOME
git clone https://github.com/KingKoopa08/vee-hour-strategy.git
cd vee-hour-strategy

# Install dependencies with legacy peer deps to avoid conflicts
echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

# Create .env file with new API key
echo "🔑 Setting up environment variables..."
cat > .env << 'EOF'
# Polygon API Configuration
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Optional: Add your Discord webhook if you have one
# DISCORD_WEBHOOK=your_webhook_here
EOF

# Install PM2 if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Test the API key
echo "🔑 Testing Polygon API key..."
node test-new-api-key.js

# Start services with PM2
echo "🚀 Starting services..."
pm2 delete all 2>/dev/null || true

# Start unified scanner
pm2 start unified-scanner.js --name "market-scanner" \
    --node-args="--max-old-space-size=2048" \
    --time \
    --log-date-format="YYYY-MM-DD HH:mm:ss"

# Optional: Start premarket server
# pm2 start premarket-server.js --name "premarket-server" \
#     --node-args="--max-old-space-size=2048" \
#     --time \
#     --log-date-format="YYYY-MM-DD HH:mm:ss"

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u $USER --hp $HOME

echo "✅ Deployment complete!"
echo ""
echo "📊 Services Status:"
pm2 list
echo ""
echo "🌐 Access your services at:"
echo "   Web UI: http://$(hostname -I | awk '{print $1}'):3050"
echo "   API: http://$(hostname -I | awk '{print $1}'):3050/api/gainers"
echo "   WebSocket: ws://$(hostname -I | awk '{print $1}'):3051"
echo ""
echo "📝 Useful commands:"
echo "   View logs: pm2 logs market-scanner"
echo "   Monitor: pm2 monit"
echo "   Restart: pm2 restart market-scanner"
echo "   Stop: pm2 stop market-scanner"