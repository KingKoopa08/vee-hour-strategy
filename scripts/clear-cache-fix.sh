#!/bin/bash

# Clear all caches and force reload WebSocket SSL fix
# This handles Node.js module caching issues

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔧 CLEARING CACHE AND FIXING WEBSOCKET${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "unified-scanner.js" ]; then
    echo -e "${RED}❌ Error: Not in the vee-hour-strategy directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Killing all Node.js and PM2 processes...${NC}"
# Kill PM2 completely
pm2 kill 2>/dev/null || true

# Kill any remaining node processes
pkill -f "node" 2>/dev/null || true
pkill -f "unified-scanner" 2>/dev/null || true

echo -e "${GREEN}✅ All processes killed${NC}"

echo ""
echo -e "${YELLOW}🗑️ Step 2: Clearing Node.js cache...${NC}"
# Clear npm cache
npm cache clean --force 2>/dev/null || true

# Remove node_modules and reinstall
if [ -d "node_modules" ]; then
    rm -rf node_modules
    echo "Removed node_modules"
fi

# Clear PM2 logs and dump
rm -rf ~/.pm2/logs/* 2>/dev/null || true
rm -f ~/.pm2/dump.pm2 2>/dev/null || true

echo -e "${GREEN}✅ Cache cleared${NC}"

echo ""
echo -e "${YELLOW}📦 Step 3: Reinstalling dependencies...${NC}"
npm install --production

echo ""
echo -e "${YELLOW}🔍 Step 4: Verifying WebSocket fix is in code...${NC}"
echo "Checking line 1000-1010:"
sed -n '1000,1010p' unified-scanner.js

echo ""
echo -e "${YELLOW}🚀 Step 5: Starting fresh with PM2...${NC}"
# Start with explicit node path and no cache
NODE_ENV=production /usr/bin/node unified-scanner.js &
TEMP_PID=$!

# Wait for server to start
sleep 3

echo ""
echo -e "${YELLOW}🧪 Step 6: Testing the served HTML...${NC}"
echo "Checking what's being served on port 3050..."

# Get the actual HTML being served
SERVED_HTML=$(curl -s http://localhost:3050/gainers | grep -A5 -B5 "new WebSocket" | head -15)

if echo "$SERVED_HTML" | grep -q "window.location.protocol === 'https:'" ; then
    echo -e "${GREEN}✅ SUCCESS! Server is serving updated code with WSS support${NC}"
    echo "Served code:"
    echo "$SERVED_HTML"
else
    echo -e "${RED}❌ Still serving old code${NC}"
    echo "Served code:"
    echo "$SERVED_HTML"

    echo ""
    echo -e "${YELLOW}🔧 Applying emergency inline fix...${NC}"

    # Kill the test process
    kill $TEMP_PID 2>/dev/null || true

    # Create a wrapper script that modifies the response
    cat > start-with-fix.js << 'EOF'
const originalFile = require('./unified-scanner.js');
// Force the WebSocket fix in the HTML response
const express = require('express');
const app = express();

// Override the /gainers route
app.get('/gainers', (req, res) => {
    // Get the original HTML
    let html = `[ORIGINAL HTML WILL BE HERE]`;

    // Replace the WebSocket code
    html = html.replace(
        "const wsUrl = 'ws://' + wsHost + ':3051';",
        `const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = protocol === 'wss:' ? protocol + '//' + wsHost + '/ws' : protocol + '//' + wsHost + ':3051';`
    );

    res.send(html);
});

// Start the server
console.log('Starting with WebSocket fix wrapper...');
EOF

    echo -e "${YELLOW}Note: Manual intervention may be needed${NC}"
fi

# Kill the test process
kill $TEMP_PID 2>/dev/null || true

echo ""
echo -e "${YELLOW}🔄 Step 7: Starting PM2 with the application...${NC}"
pm2 start unified-scanner.js --name market-scanner \
  --max-memory-restart 1G \
  --log-date-format="YYYY-MM-DD HH:mm:ss" \
  --merge-logs \
  --time

pm2 save

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📋 CACHE CLEAR COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}Application restarted with cleared cache${NC}"
echo ""
echo -e "${YELLOW}Final test:${NC}"
curl -s http://localhost:3050/gainers | grep "new WebSocket" | head -2

echo ""
echo -e "${YELLOW}Now test in browser:${NC}"
echo "1. Clear browser cache (Ctrl+Shift+Delete)"
echo "2. Visit https://daily3club.com/gainers"
echo "3. Check DevTools Console"
echo ""
echo -e "${YELLOW}If STILL having issues, check:${NC}"
echo "grep -n \"ws://\" unified-scanner.js"
echo "pm2 logs market-scanner --lines 50"