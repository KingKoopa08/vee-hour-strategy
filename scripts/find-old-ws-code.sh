#!/bin/bash

# Find where the old WebSocket code is coming from

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔍 FINDING OLD WEBSOCKET CODE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Searching for the old WebSocket pattern...${NC}"
echo ""

# Search for the old pattern in all JS files
echo "Searching for: const wsUrl = 'ws://' + wsHost + ':3051'"
echo "----------------------------------------"

# Search in current directory
if grep -r "const wsUrl = 'ws://' + wsHost + ':3051'" . --include="*.js" 2>/dev/null; then
    echo -e "${RED}❌ Found old WebSocket code in files above${NC}"
else
    echo -e "${GREEN}✅ Old pattern not found in .js files${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Step 2: Checking for duplicate unified-scanner files...${NC}"
find / -name "unified-scanner.js" 2>/dev/null | head -20

echo ""
echo -e "${YELLOW}📋 Step 3: Checking PM2 is using correct file...${NC}"
pm2 describe market-scanner | grep "script path"

echo ""
echo -e "${YELLOW}📋 Step 4: Checking what's at line 272 (from browser error)...${NC}"
echo "Line 270-275 of unified-scanner.js:"
sed -n '270,275p' unified-scanner.js

echo ""
echo "Line 998-1010 of unified-scanner.js (where WebSocket code should be):"
sed -n '998,1010p' unified-scanner.js

echo ""
echo -e "${YELLOW}📋 Step 5: Checking if file was modified correctly...${NC}"
md5sum unified-scanner.js

echo ""
echo -e "${YELLOW}📋 Step 6: Getting actual response from server...${NC}"
echo "Line numbers around WebSocket in served HTML:"
curl -s http://localhost:3050/gainers | grep -n "new WebSocket" | head -5

echo ""
echo -e "${YELLOW}📋 Step 7: Checking git status...${NC}"
git status
git log -1 --oneline

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📋 ANALYSIS COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"

echo ""
echo -e "${YELLOW}The issue appears to be:${NC}"
echo "The file shows the fix at lines 1002-1007"
echo "But the server serves old code from a template string"
echo ""
echo -e "${RED}This means the HTML is hardcoded in a template literal${NC}"
echo "and not reading from the actual WebSocket code section!"