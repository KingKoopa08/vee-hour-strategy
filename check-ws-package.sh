#!/bin/bash

# Check if ws package is installed and restart scanner

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔍 CHECKING WS PACKAGE${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check if node_modules exists
echo -e "${YELLOW}Checking node_modules...${NC}"
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✅ node_modules exists${NC}"
else
    echo -e "${RED}❌ node_modules not found${NC}"
fi
echo ""

# Check if ws package is installed
echo -e "${YELLOW}Checking ws package...${NC}"
if [ -d "node_modules/ws" ]; then
    echo -e "${GREEN}✅ ws package installed${NC}"
    echo "Version: $(cat node_modules/ws/package.json | grep '"version"' | head -1)"
else
    echo -e "${RED}❌ ws package NOT installed${NC}"
fi
echo ""

# Check package.json
echo -e "${YELLOW}Checking package.json dependencies...${NC}"
if [ -f "package.json" ]; then
    echo "ws in dependencies:"
    grep '"ws"' package.json || echo "  Not found in package.json"
else
    echo -e "${RED}❌ package.json not found${NC}"
fi
echo ""

# Check if WebSocket is imported in unified-scanner.js
echo -e "${YELLOW}Checking WebSocket import in unified-scanner.js...${NC}"
grep -n "require.*ws\|import.*ws" unified-scanner.js | head -5 || echo "No import found"
echo ""

# Try to restart with error logging
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔄 RESTARTING MARKET SCANNER${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

echo -e "${YELLOW}Stopping market-scanner...${NC}"
pm2 stop market-scanner
echo ""

echo -e "${YELLOW}Deleting old instance...${NC}"
pm2 delete market-scanner
echo ""

echo -e "${YELLOW}Starting fresh instance...${NC}"
pm2 start unified-scanner.js --name market-scanner \
    --max-memory-restart 1G \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --merge-logs \
    --time
echo ""

echo -e "${YELLOW}Waiting 5 seconds for startup...${NC}"
sleep 5
echo ""

echo -e "${YELLOW}Checking port 3051...${NC}"
if netstat -tlnp 2>/dev/null | grep :3051 || ss -tlnp | grep :3051; then
    echo -e "${GREEN}✅ Port 3051 is now listening!${NC}"
else
    echo -e "${RED}❌ Port 3051 still not listening${NC}"
    echo ""
    echo -e "${YELLOW}Recent logs:${NC}"
    pm2 logs market-scanner --lines 30 --nostream
fi
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 NEXT STEPS${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "Monitor logs for errors:"
echo -e "  ${CYAN}pm2 logs market-scanner${NC}"
echo ""
