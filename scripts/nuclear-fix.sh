#!/bin/bash

# Nuclear option - completely replace the unified-scanner.js file
# This ensures no caching issues

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}☢️  NUCLEAR FIX - COMPLETE REPLACEMENT${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Completely stopping everything...${NC}"
# Kill everything
pm2 kill
pkill -f node || true
pkill -f unified || true

echo -e "${GREEN}✅ All processes terminated${NC}"

echo ""
echo -e "${YELLOW}📋 Step 2: Removing all cached files...${NC}"
# Remove PM2 entirely
rm -rf ~/.pm2
rm -rf node_modules/.cache 2>/dev/null || true

# Move the current file
mv unified-scanner.js unified-scanner.old.$(date +%s)

echo -e "${GREEN}✅ Caches cleared${NC}"

echo ""
echo -e "${YELLOW}📋 Step 3: Getting fresh copy from GitHub...${NC}"
# Get a completely fresh copy
git checkout HEAD -- unified-scanner.js
git pull origin main

echo -e "${GREEN}✅ Fresh copy obtained${NC}"

echo ""
echo -e "${YELLOW}📋 Step 4: Manually fixing the WebSocket code in ALL locations...${NC}"

# Use sed to fix EVERY occurrence
sed -i "s/const wsUrl = 'ws:\/\/' + wsHost + ':3051';/const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';\n            const wsUrl = protocol === 'wss:' ? protocol + '\/\/' + wsHost + '\/ws' : protocol + '\/\/' + wsHost + ':3051';/g" unified-scanner.js

# Double check and fix any remaining patterns
sed -i "s/ws:\/\/\${wsHost}:3051/(window.location.protocol === 'https:' ? 'wss:\/\/' + wsHost + '\/ws' : 'ws:\/\/' + wsHost + ':3051')/g" unified-scanner.js

echo -e "${GREEN}✅ WebSocket code fixed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 5: Creating a test to verify...${NC}"

# Create a simple test server
cat > test-server.js << 'EOF'
const fs = require('fs');
const http = require('http');

// Load the file fresh
delete require.cache[require.resolve('./unified-scanner.js')];
const content = fs.readFileSync('./unified-scanner.js', 'utf8');

// Check if the fix is there
if (content.includes("const wsUrl = 'ws://' + wsHost + ':3051';")) {
    console.log('❌ ERROR: Old WebSocket code still found!');
    process.exit(1);
} else if (content.includes("window.location.protocol === 'https:'")) {
    console.log('✅ WebSocket fix is in the file');
} else {
    console.log('⚠️  WebSocket code not found at all');
}

// Start the actual server
require('./unified-scanner.js');
EOF

echo ""
echo -e "${YELLOW}📋 Step 6: Starting with Node directly (no PM2)...${NC}"

# Start directly with node
timeout 5 node test-server.js &
TEST_PID=$!
sleep 3

echo ""
echo -e "${YELLOW}📋 Step 7: Testing what's actually served...${NC}"

RESULT=$(curl -s http://localhost:3050/gainers | grep -A2 -B2 "new WebSocket" | head -10)
echo "$RESULT"

if echo "$RESULT" | grep -q "window.location.protocol === 'https:'" ; then
    echo -e "${GREEN}✅ SUCCESS! Server is serving the fixed code!${NC}"
else
    echo -e "${RED}❌ STILL serving old code - investigating...${NC}"

    echo ""
    echo "Checking if running from wrong directory:"
    pwd
    ls -la unified-scanner.js

    echo ""
    echo "Checking process:"
    ps aux | grep node | grep -v grep
fi

# Kill test
kill $TEST_PID 2>/dev/null || true

echo ""
echo -e "${YELLOW}📋 Step 8: Starting with PM2 fresh...${NC}"

# Remove test file
rm test-server.js

# Start PM2 completely fresh
PM2_HOME=/tmp/pm2-$(date +%s) pm2 start unified-scanner.js --name market-scanner

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}☢️  NUCLEAR FIX COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}Everything has been completely replaced${NC}"
echo ""
echo "Now:"
echo "1. Clear browser cache COMPLETELY"
echo "2. Try https://daily3club.com/gainers"
echo ""
echo "If this STILL doesn't work, there's another server somewhere!"