#!/bin/bash

# Force apply WebSocket SSL fix
# This script directly patches the running code

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔧 FORCE APPLYING WEBSOCKET SSL FIX${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "unified-scanner.js" ]; then
    echo -e "${RED}❌ Error: Not in the vee-hour-strategy directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Backing up current file...${NC}"
cp unified-scanner.js unified-scanner.js.backup.$(date +%Y%m%d-%H%M%S)

echo -e "${YELLOW}🔧 Step 2: Patching WebSocket connection in unified-scanner.js...${NC}"

# Find and replace the old WebSocket code
# This is the problematic code that's being served
cat > /tmp/wss-patch.js << 'EOF'
// Find this pattern:
const wsHost = window.location.hostname || 'localhost';
const wsUrl = 'ws://' + wsHost + ':3051';
ws = new WebSocket(wsUrl);

// Replace with:
const wsHost = window.location.hostname || 'localhost';
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = protocol === 'wss:'
    ? protocol + '//' + wsHost + '/ws'
    : protocol + '//' + wsHost + ':3051';
ws = new WebSocket(wsUrl);
EOF

# Apply the fix using sed - multiple patterns to catch all variations
echo "Applying WebSocket SSL fix..."

# Pattern 1: Fix the simple ws:// pattern
sed -i "s|const wsUrl = 'ws://' + wsHost + ':3051';|const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';\n            const wsUrl = protocol === 'wss:' ? protocol + '//' + wsHost + '/ws' : protocol + '//' + wsHost + ':3051';|g" unified-scanner.js

# Pattern 2: Also fix any hardcoded ws://
sed -i "s|ws://\${wsHost}:3051|' + (window.location.protocol === 'https:' ? 'wss://' + wsHost + '/ws' : 'ws://' + wsHost + ':3051') + '|g" unified-scanner.js

# Pattern 3: Fix if it's in template literal form
sed -i "s|\`ws://\${window.location.hostname}:3051\`|(window.location.protocol === 'https:' ? \`wss://\${window.location.hostname}/ws\` : \`ws://\${window.location.hostname}:3051\`)|g" unified-scanner.js

echo -e "${GREEN}✅ Patches applied${NC}"

echo ""
echo -e "${YELLOW}🔍 Step 3: Verifying the fix...${NC}"

# Check if the fix was applied
if grep -q "window.location.protocol === 'https:'" unified-scanner.js; then
    echo -e "${GREEN}✅ WebSocket SSL fix found in code${NC}"

    # Show the fixed lines
    echo "Fixed code:"
    grep -A2 -B2 "window.location.protocol === 'https:'" unified-scanner.js | head -10
else
    echo -e "${RED}❌ Fix not found, manual intervention needed${NC}"
fi

echo ""
echo -e "${YELLOW}🔄 Step 4: Restarting PM2...${NC}"

# Kill all PM2 processes and restart fresh
pm2 kill
pm2 start unified-scanner.js --name market-scanner \
  --max-memory-restart 1G \
  --log-date-format="YYYY-MM-DD HH:mm:ss"

pm2 save
pm2 startup systemd -u root --hp /root

echo ""
echo -e "${YELLOW}⏱️ Step 5: Waiting for server to start...${NC}"
sleep 3

echo -e "${YELLOW}🧪 Step 6: Testing the output...${NC}"
if curl -s http://localhost:3050/gainers | grep -q "window.location.protocol === 'https:'" ; then
    echo -e "${GREEN}✅ SUCCESS! Server is now serving code with WSS support${NC}"
else
    echo -e "${RED}❌ Still serving old code. Checking what's being served:${NC}"
    curl -s http://localhost:3050/gainers | grep -A3 -B3 "new WebSocket" | head -20
fi

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📋 FORCE FIX COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}✅ WebSocket SSL fix has been forced${NC}"
echo ""
echo -e "${YELLOW}Test now:${NC}"
echo "1. Clear browser cache completely (Ctrl+Shift+Delete)"
echo "2. Visit https://daily3club.com/gainers"
echo "3. Check DevTools Console for WebSocket connection"
echo ""
echo -e "${YELLOW}If still having issues:${NC}"
echo "- Check nginx: sudo nginx -t && sudo systemctl reload nginx"
echo "- Check PM2: pm2 logs market-scanner --lines 100"
echo "- Restart everything: pm2 kill && pm2 resurrect"