#!/bin/bash

# ============================================
# LOCAL DEPLOY SCRIPT - No Git Required
# Just deploy what's already on the server
# Server: 15.204.86.6
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 DEPLOYING PREMARKET SCANNER${NC}"
echo -e "${CYAN}   Server: 15.204.86.6${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Assuming we're already in the project directory
# If not, uncomment the next line and update the path:
# cd /path/to/your/premarket/scanner

# Step 1: Install npm dependencies
echo -e "${YELLOW}📦 Installing npm packages...${NC}"
npm install --production

# Step 2: Create/verify .env file
echo -e "${YELLOW}⚙️  Setting up environment...${NC}"
if [ ! -f .env ]; then
    cat > .env << EOF
# Polygon API Configuration
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Environment
NODE_ENV=production
EOF
    echo -e "${GREEN}✅ Environment configured${NC}"
else
    echo -e "${GREEN}✅ Using existing .env file${NC}"
fi

# Step 3: Stop existing PM2 process if running
echo -e "${YELLOW}🛑 Stopping existing service...${NC}"
pm2 stop market-scanner 2>/dev/null || true
pm2 delete market-scanner 2>/dev/null || true

# Kill any process using our ports
fuser -k 3050/tcp 2>/dev/null || true
fuser -k 3051/tcp 2>/dev/null || true

# Step 4: Start with PM2
echo -e "${YELLOW}🚀 Starting application...${NC}"
pm2 start unified-scanner.js --name market-scanner \
    --max-memory-restart 1G \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --merge-logs \
    --time

# Save PM2 configuration
pm2 save

# Setup PM2 to start on reboot (only needs to be done once)
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# Step 5: Verify deployment
echo -e "${YELLOW}🔍 Verifying deployment...${NC}"
sleep 5

# Check if PM2 process is running
if pm2 list | grep -q "market-scanner.*online"; then
    echo -e "${GREEN}✅ Service is running${NC}"
else
    echo -e "${YELLOW}⚠️  Service status unknown. Checking logs...${NC}"
    pm2 logs market-scanner --lines 10
fi

# Check if HTTP endpoint responds
if curl -s --max-time 5 http://localhost:3050 > /dev/null; then
    echo -e "${GREEN}✅ HTTP server responding${NC}"
else
    echo -e "${YELLOW}⚠️  HTTP may still be starting up...${NC}"
fi

# Check API endpoint
if curl -s --max-time 5 http://localhost:3050/api/gainers | grep -q "symbol"; then
    echo -e "${GREEN}✅ API endpoints working${NC}"
else
    echo -e "${YELLOW}⚠️  API initializing...${NC}"
fi

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Access your scanner at:${NC}"
echo -e "  Main Hub:      ${CYAN}http://15.204.86.6:3050${NC}"
echo -e "  Volume Movers: ${CYAN}http://15.204.86.6:3050/volume${NC}"
echo -e "  Top Gainers:   ${CYAN}http://15.204.86.6:3050/gainers${NC}"
echo -e "  Whales:        ${CYAN}http://15.204.86.6:3050/whales${NC}"
echo ""
echo -e "${YELLOW}Commands:${NC}"
echo -e "  View logs:     ${CYAN}pm2 logs market-scanner${NC}"
echo -e "  Monitor:       ${CYAN}pm2 monit${NC}"
echo -e "  Restart:       ${CYAN}pm2 restart market-scanner${NC}"
echo -e "  Stop:          ${CYAN}pm2 stop market-scanner${NC}"