#!/bin/bash

# Start the market scanner in production
# This script ensures PM2 is properly configured and starts the application

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🚀 STARTING MARKET SCANNER${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "unified-scanner.js" ]; then
    echo -e "${RED}❌ Error: Not in the vee-hour-strategy directory${NC}"
    echo "Please cd to the project directory first"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️ .env file not found. Creating it...${NC}"
    cat > .env << EOF
# Polygon.io API
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Environment
NODE_ENV=production
EOF
    echo -e "${GREEN}✅ .env file created${NC}"
fi

echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install --production
echo -e "${GREEN}✅ Dependencies installed${NC}"

echo ""
echo -e "${YELLOW}🔄 Starting application with PM2...${NC}"

# Stop if already running
pm2 delete market-scanner 2>/dev/null || true

# Start the application
pm2 start unified-scanner.js --name market-scanner \
  --max-memory-restart 1G \
  --log-date-format="YYYY-MM-DD HH:mm:ss" \
  --time

# Save PM2 configuration
pm2 save

# Setup PM2 startup
pm2 startup systemd -u root --hp /root

echo ""
echo -e "${YELLOW}📊 Application Status:${NC}"
pm2 status market-scanner

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}✅ MARKET SCANNER STARTED!${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}Useful commands:${NC}"
echo "pm2 status          - Check application status"
echo "pm2 logs market-scanner - View logs"
echo "pm2 monit           - Monitor resources"
echo "pm2 restart market-scanner - Restart application"
echo ""

echo -e "${CYAN}Test URLs:${NC}"
echo "- http://localhost:3050 (Local test)"
echo "- https://daily3club.com/gainers (Production)"
echo "- https://daily3club.com/volume (Volume movers)"
echo "- https://daily3club.com/api/gainers (API)"