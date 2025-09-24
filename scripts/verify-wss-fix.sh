#!/bin/bash

# Verify and fix WebSocket SSL issue on production
# This script checks if the code has the proper WSS fix

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔍 VERIFYING WEBSOCKET SSL FIX${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "unified-scanner.js" ]; then
    echo -e "${RED}❌ Error: Not in the vee-hour-strategy directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Checking current code for WSS support...${NC}"

# Check if unified-scanner.js has the WSS fix
if grep -q "window.location.protocol === 'https:' ? 'wss:' : 'ws:'" unified-scanner.js; then
    echo -e "${GREEN}✅ unified-scanner.js has WSS fix${NC}"
else
    echo -e "${RED}❌ unified-scanner.js MISSING WSS fix${NC}"
    echo "The code needs to be updated!"
fi

echo ""
echo -e "${YELLOW}📥 Step 2: Getting latest code from GitHub...${NC}"

# Show current branch and commit
echo "Current branch: $(git branch --show-current)"
echo "Current commit: $(git log -1 --oneline)"

# Pull latest
git pull origin main

echo ""
echo -e "${YELLOW}🔍 Step 3: Verifying the fix is in the code...${NC}"

# Check the specific line that should have the fix
echo "Checking line 1002-1007 in unified-scanner.js:"
sed -n '1002,1007p' unified-scanner.js

echo ""
echo -e "${YELLOW}🔄 Step 4: Restarting application to load new code...${NC}"

# Check if PM2 is running
if pm2 status market-scanner >/dev/null 2>&1; then
    echo "PM2 process found, restarting..."
    pm2 stop market-scanner
    pm2 delete market-scanner
fi

# Start fresh
pm2 start unified-scanner.js --name market-scanner \
  --max-memory-restart 1G \
  --log-date-format="YYYY-MM-DD HH:mm:ss"

pm2 save

echo ""
echo -e "${YELLOW}📊 Application Status:${NC}"
pm2 status market-scanner

echo ""
echo -e "${YELLOW}🧪 Step 5: Testing the output...${NC}"

# Test if the served HTML has the fix
echo "Testing localhost:3050 output for WSS support..."
if curl -s http://localhost:3050/gainers | grep -q "window.location.protocol === 'https:'" ; then
    echo -e "${GREEN}✅ Server is serving updated code with WSS support${NC}"
else
    echo -e "${RED}❌ Server is NOT serving updated code${NC}"
    echo "Checking what's being served:"
    curl -s http://localhost:3050/gainers | grep -A2 -B2 "new WebSocket" | head -20
fi

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📋 VERIFICATION COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo "1. Clear your browser cache (Ctrl+F5)"
echo "2. Visit https://daily3club.com/gainers"
echo "3. Open DevTools (F12) and check Console"
echo "4. Should see 'Connected to WebSocket' without errors"
echo ""
echo -e "${YELLOW}Debug commands:${NC}"
echo "pm2 logs market-scanner --lines 50"
echo "pm2 monit"