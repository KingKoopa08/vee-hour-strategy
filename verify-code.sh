#!/bin/bash

# Verify the code has the error handlers

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔍 VERIFYING CODE${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check WebSocket error handler
echo -e "${YELLOW}Checking for WebSocket error handler...${NC}"
if grep -q "wss.on('error'" unified-scanner.js; then
    echo -e "${GREEN}✅ WebSocket error handler found${NC}"
    echo ""
    grep -A 5 "wss.on('error'" unified-scanner.js
else
    echo -e "${RED}❌ WebSocket error handler NOT found${NC}"
fi
echo ""

# Check WebSocket startup log
echo -e "${YELLOW}Checking for WebSocket startup log...${NC}"
if grep -q "WebSocket server listening" unified-scanner.js; then
    echo -e "${GREEN}✅ WebSocket startup log found${NC}"
    grep "WebSocket server listening" unified-scanner.js
else
    echo -e "${RED}❌ WebSocket startup log NOT found${NC}"
fi
echo ""

# Check HTTP error handler
echo -e "${YELLOW}Checking for HTTP server error handler...${NC}"
if grep -q "server.on('error'" unified-scanner.js; then
    echo -e "${GREEN}✅ HTTP error handler found${NC}"
    echo ""
    grep -A 5 "server.on('error'" unified-scanner.js
else
    echo -e "${RED}❌ HTTP error handler NOT found${NC}"
fi
echo ""

# Check which file PM2 is running
echo -e "${YELLOW}Checking PM2 process details...${NC}"
pm2 show market-scanner | grep -E "script path|exec cwd" || echo "Could not find process details"
echo ""

# Check file modification time
echo -e "${YELLOW}File modification time:${NC}"
ls -lh unified-scanner.js | awk '{print $6, $7, $8, $9}'
echo ""

# Check if there's a node_modules cache issue
echo -e "${YELLOW}Checking for cached requires...${NC}"
echo "PM2 restart should clear require cache, but let's verify..."
pm2 delete market-scanner 2>/dev/null
sleep 2
pm2 start unified-scanner.js --name market-scanner \
    --max-memory-restart 1G \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --merge-logs \
    --time
sleep 5
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 CHECKING STARTUP LOGS${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
pm2 logs market-scanner --lines 100 --nostream | head -50
echo ""

echo -e "${YELLOW}Checking port 3051...${NC}"
netstat -tlnp 2>/dev/null | grep 3051 || ss -tlnp | grep 3051 || echo "Port 3051 not listening"
echo ""
