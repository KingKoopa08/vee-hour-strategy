#!/bin/bash

# Debug what's actually being served

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔍 DEBUGGING WHAT'S BEING SERVED${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Checking what unified-scanner.js contains...${NC}"
echo "Lines 995-1010 (WebSocket section):"
sed -n '995,1010p' unified-scanner.js

echo ""
echo -e "${YELLOW}📋 Step 2: Searching for ALL WebSocket patterns in file...${NC}"
echo "All occurrences of 'ws://' in the file:"
grep -n "ws://" unified-scanner.js | head -10 || echo "No direct ws:// found"

echo ""
echo -e "${YELLOW}📋 Step 3: Getting ACTUAL HTML from local server...${NC}"
echo "Direct request to localhost:3050:"
DIRECT_RESPONSE=$(curl -s http://localhost:3050/gainers | grep -B2 -A2 "new WebSocket")
echo "$DIRECT_RESPONSE" | head -10

echo ""
echo -e "${YELLOW}📋 Step 4: Getting HTML through NGINX...${NC}"
echo "Request through nginx (https):"
NGINX_RESPONSE=$(curl -sk https://daily3club.com/gainers | grep -B2 -A2 "new WebSocket")
echo "$NGINX_RESPONSE" | head -10

echo ""
echo -e "${YELLOW}📋 Step 5: Checking if responses match...${NC}"
if [ "$DIRECT_RESPONSE" = "$NGINX_RESPONSE" ]; then
    echo -e "${GREEN}✅ Responses match - nginx is not the issue${NC}"
else
    echo -e "${RED}❌ Responses differ - nginx may be caching${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Step 6: Checking PM2 details...${NC}"
pm2 info market-scanner | grep -E "script path|exec cwd|created at"

echo ""
echo -e "${YELLOW}📋 Step 7: Checking for multiple processes...${NC}"
ps aux | grep -E "unified-scanner|node" | grep -v grep

echo ""
echo -e "${YELLOW}📋 Step 8: Finding the EXACT line being served...${NC}"
echo "The browser shows error at line 272. Let's check around that line:"
echo "Lines 270-275:"
curl -s http://localhost:3050/gainers | sed -n '270,275p'

echo ""
echo -e "${YELLOW}📋 Step 9: Checking if file was actually modified...${NC}"
echo "File modification time:"
ls -la unified-scanner.js
echo "File size:"
wc -l unified-scanner.js

echo ""
echo -e "${YELLOW}📋 Step 10: Getting the EXACT WebSocket code being served...${NC}"
echo "Extracting the connect function from served HTML:"
curl -s http://localhost:3050/gainers | sed -n '/function connect()/,/ws.onopen/p' | head -15

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔍 DIAGNOSIS COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}Key findings:${NC}"
echo "1. Check if the file actually has the fix"
echo "2. Check if PM2 is serving from the right location"
echo "3. Check if the served HTML matches the file"
echo ""

# Final check
if curl -s http://localhost:3050/gainers | grep -q "const wsUrl = 'ws://' + wsHost + ':3051'"; then
    echo -e "${RED}❌ PROBLEM: Server IS serving old WebSocket code${NC}"
    echo ""
    echo "Possible causes:"
    echo "1. PM2 is running from a different directory"
    echo "2. The HTML template is hardcoded elsewhere"
    echo "3. There's a reverse proxy or CDN caching"
else
    echo -e "${GREEN}✅ Server is serving updated code${NC}"
fi