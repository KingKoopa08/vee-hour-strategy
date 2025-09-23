#!/bin/bash

# Force Rebuild Script - Complete clean rebuild
# Usage: bash rebuild.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${RED}===============================================${NC}"
echo -e "${RED}🔧 FORCE REBUILD - CLEAN INSTALLATION${NC}"
echo -e "${RED}===============================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  This will:${NC}"
echo "   - Stop ALL PM2 processes"
echo "   - Delete node_modules and package-lock.json"
echo "   - Pull latest code from GitHub"
echo "   - Reinstall everything fresh"
echo "   - Configure NEW API key"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

# Step 1: Stop everything
echo ""
echo -e "${YELLOW}🛑 Stopping all PM2 processes...${NC}"
pm2 kill 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Step 2: Find and clean all installations
echo ""
echo -e "${YELLOW}🔍 Finding all installations...${NC}"
INSTALLATIONS=$(find ~ -type d -name "vee-hour-strategy" 2>/dev/null)

for dir in $INSTALLATIONS; do
    echo -e "${YELLOW}   Cleaning: $dir${NC}"
    if [ -d "$dir" ]; then
        cd "$dir"
        rm -rf node_modules package-lock.json .env
    fi
done

# Step 3: Decide on installation directory
echo ""
echo -e "${YELLOW}📁 Setting up in home directory...${NC}"
cd ~

# Step 4: Remove old installation and clone fresh
if [ -d "vee-hour-strategy" ]; then
    echo -e "${YELLOW}🗑️  Removing old installation...${NC}"
    rm -rf vee-hour-strategy
fi

echo -e "${YELLOW}📥 Cloning fresh from GitHub...${NC}"
git clone https://github.com/KingKoopa08/vee-hour-strategy.git
cd vee-hour-strategy

# Step 5: Install dependencies fresh
echo -e "${YELLOW}📦 Installing dependencies (fresh)...${NC}"
npm cache clean --force
npm install --legacy-peer-deps

# Step 6: Create NEW .env with NEW API key
echo -e "${YELLOW}🔑 Creating new environment with NEW API key...${NC}"
cat > .env << 'EOF'
# Polygon API Configuration - NEW KEY
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Environment
NODE_ENV=production

# Optional Discord (uncomment and add your webhook)
# DISCORD_WEBHOOK=your_webhook_here
EOF

echo -e "${GREEN}✅ New API key configured${NC}"

# Step 7: Test the new API key
echo ""
echo -e "${YELLOW}🔑 Testing NEW API key...${NC}"
cat > test-key.js << 'EOF'
const axios = require('axios');
const API_KEY = 'KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV';

console.log('Testing key:', API_KEY.substring(0, 20) + '...');

axios.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${API_KEY}&limit=5`)
    .then(res => {
        console.log('✅ NEW API Key WORKS!');
        console.log(`   Tickers found: ${res.data.count}`);
        if (res.data.tickers && res.data.tickers[0]) {
            console.log(`   Sample: ${res.data.tickers[0].ticker} - $${res.data.tickers[0].day.c}`);
        }
    })
    .catch(err => {
        console.log('❌ API Error:', err.response?.status, err.response?.statusText);
        process.exit(1);
    });
EOF

node test-key.js
rm -f test-key.js

# Step 8: Start fresh PM2 instance
echo ""
echo -e "${YELLOW}🚀 Starting fresh PM2 process...${NC}"

# Start with explicit environment loading
pm2 start unified-scanner.js \
    --name "market-scanner" \
    --node-args="--max-old-space-size=2048" \
    --time \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --restart-delay 5000 \
    --max-restarts 10 \
    --update-env \
    --merge-logs

# Save PM2 configuration
pm2 save --force

# Setup startup
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

# Step 9: Verify everything
echo ""
echo -e "${YELLOW}🔍 Verifying installation...${NC}"
sleep 3

# Check if API is responding
if curl -s -f http://localhost:3050/api/gainers > /dev/null; then
    echo -e "${GREEN}✅ API is responding${NC}"

    # Get stock count
    STOCKS=$(curl -s http://localhost:3050/api/gainers | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d['count']} stocks, first: {d['stocks'][0]['symbol'] if d['stocks'] else 'none'}\")" 2>/dev/null || echo "parse error")
    echo "   $STOCKS"
else
    echo -e "${RED}❌ API not responding yet (may need a moment)${NC}"
fi

# Final status
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}✅ REBUILD COMPLETE!${NC}"
echo -e "${GREEN}===============================================${NC}"

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}📊 Status:${NC}"
pm2 list

echo ""
echo -e "${GREEN}🌐 Access Points:${NC}"
echo "   Dashboard: http://$SERVER_IP:3050"
echo "   API: http://$SERVER_IP:3050/api/gainers"
echo "   WebSocket: ws://$SERVER_IP:3051"

echo ""
echo -e "${GREEN}📝 Commands:${NC}"
echo "   Check logs: pm2 logs market-scanner"
echo "   Monitor: pm2 monit"
echo "   Status: pm2 status"

echo ""
echo -e "${GREEN}🔍 Recent logs:${NC}"
pm2 logs market-scanner --lines 10 --nostream

echo ""
echo -e "${CYAN}💡 If API is not responding, wait 30 seconds and check:${NC}"
echo "   curl http://localhost:3050/api/gainers | head"