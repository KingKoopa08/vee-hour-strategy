#!/bin/bash

# Check why WebSocket port 3051 is not listening

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔍 CHECKING WEBSOCKET PORT 3051${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check if port is listening
echo -e "${YELLOW}Checking if port 3051 is listening...${NC}"
if netstat -tlnp 2>/dev/null | grep :3051 || ss -tlnp | grep :3051; then
    echo -e "${GREEN}✅ Port 3051 is listening${NC}"
else
    echo -e "${RED}❌ Port 3051 is NOT listening${NC}"
fi
echo ""

# Check PM2 logs for WebSocket server startup
echo -e "${YELLOW}Checking PM2 logs for WebSocket server...${NC}"
pm2 logs market-scanner --lines 100 --nostream | grep -i "websocket\|ws_port\|3051\|listening" || echo "No WebSocket startup messages found"
echo ""

# Check for errors
echo -e "${YELLOW}Checking for port binding errors...${NC}"
pm2 logs market-scanner --lines 100 --nostream | grep -i "error\|eaddrinuse\|bind\|failed" | tail -20 || echo "No errors found"
echo ""

# Check if something else is using port 3051
echo -e "${YELLOW}Checking what's using port 3051...${NC}"
sudo lsof -i :3051 2>/dev/null || echo "Nothing using port 3051"
echo ""

# Check unified-scanner.js for WS_PORT
echo -e "${YELLOW}Checking unified-scanner.js configuration...${NC}"
grep "const WS_PORT" unified-scanner.js || echo "WS_PORT not found"
grep "WebSocket.Server" unified-scanner.js || echo "WebSocket.Server not found"
echo ""

# Check environment variables
echo -e "${YELLOW}Checking PM2 environment variables...${NC}"
pm2 show market-scanner | grep -A 5 "env:" || echo "No env vars shown"
echo ""

# Restart with verbose logging
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 RECOMMENDATIONS${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${YELLOW}To fix WebSocket not starting:${NC}"
echo ""
echo -e "1. Check recent logs:"
echo -e "   ${CYAN}pm2 logs market-scanner --lines 200${NC}"
echo ""
echo -e "2. Restart the scanner:"
echo -e "   ${CYAN}pm2 restart market-scanner${NC}"
echo ""
echo -e "3. Check if port 3051 starts listening:"
echo -e "   ${CYAN}netstat -tlnp | grep 3051${NC}"
echo ""
echo -e "4. If still not working, check the code:"
echo -e "   ${CYAN}grep -n 'WebSocket.Server' unified-scanner.js${NC}"
echo ""
