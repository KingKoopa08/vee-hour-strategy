#!/bin/bash

# Main Deployment Script
# Handles both fresh install and updates
# Usage: bash deploy.sh

set -e

# Configuration
REPO_URL="https://github.com/KingKoopa08/vee-hour-strategy.git"
APP_DIR="$HOME/vee-hour-strategy"
POLYGON_API_KEY="KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}🚀 MARKET SCANNER DEPLOYMENT${NC}"
echo -e "${GREEN}===============================================${NC}"

# Stop any running services
echo -e "${YELLOW}🛑 Stopping existing services...${NC}"
pm2 delete market-scanner 2>/dev/null || true
pm2 delete premarket-server 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Clone or update repository
if [ -d "$APP_DIR" ]; then
    echo -e "${YELLOW}📦 Updating existing installation...${NC}"
    cd "$APP_DIR"
    git fetch --all
    git reset --hard origin/main
    git pull origin main
else
    echo -e "${YELLOW}📦 Fresh installation...${NC}"
    cd $HOME
    git clone $REPO_URL
    cd "$APP_DIR"
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install --legacy-peer-deps

# Setup environment
echo -e "${YELLOW}🔑 Configuring environment...${NC}"
cat > .env << EOF
# Polygon API Configuration
POLYGON_API_KEY=$POLYGON_API_KEY

# Server Ports
PORT=3050
WS_PORT=3051

# Market Scanner Settings
NODE_ENV=production
EOF

# Test API key
echo -e "${YELLOW}🔑 Testing API connection...${NC}"
cat > test-quick.js << 'EOF'
const axios = require('axios');
const key = process.env.POLYGON_API_KEY || 'KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV';
axios.get(`https://api.polygon.io/v1/marketstatus/now?apiKey=${key}`)
    .then(r => console.log('✅ API Working! Market:', r.data.market))
    .catch(e => console.log('❌ API Error:', e.message))
    .finally(() => process.exit(0));
EOF
timeout 10 node test-quick.js || echo "⚠️  API test timeout (continuing anyway)"
rm -f test-quick.js

# Start services
echo -e "${YELLOW}🚀 Starting services with PM2...${NC}"
pm2 start unified-scanner.js \
    --name "market-scanner" \
    --node-args="--max-old-space-size=2048" \
    --time \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --restart-delay 5000 \
    --max-restarts 10

# Optional: Start additional services
# pm2 start premarket-server.js --name "premarket-server"

# Save PM2 configuration
pm2 save
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

# Display status
SERVER_IP=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""
echo -e "${GREEN}📊 Service Status:${NC}"
pm2 list
echo ""
echo -e "${GREEN}🌐 Access Points:${NC}"
echo "   Dashboard: http://$SERVER_IP:3050"
echo "   API: http://$SERVER_IP:3050/api/gainers"
echo "   WebSocket: ws://$SERVER_IP:3051"
echo ""
echo -e "${GREEN}📝 Commands:${NC}"
echo "   View logs: pm2 logs market-scanner"
echo "   Monitor: pm2 monit"
echo "   Restart: pm2 restart market-scanner"
echo ""
echo -e "${GREEN}🔍 Testing API endpoint...${NC}"
curl -s http://localhost:3050/api/gainers | head -c 200
echo ""