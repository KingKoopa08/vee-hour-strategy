#!/bin/bash

# Fix the WebSocket code in the /gainers route template
# The issue is the HTML is hardcoded in the route, not using the fixed code

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔧 FIXING /gainers ROUTE WEBSOCKET CODE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "unified-scanner.js" ]; then
    echo -e "${RED}❌ Error: Not in the vee-hour-strategy directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Backing up current file...${NC}"
cp unified-scanner.js unified-scanner.js.backup.$(date +%Y%m%d-%H%M%S)

echo -e "${YELLOW}🔍 Step 2: Finding the /gainers route HTML template...${NC}"

# The HTML template in the /gainers route has its own WebSocket code
# We need to find and fix THAT specific code

# Create a Python script to fix the template string
cat > fix_template.py << 'EOF'
import re

# Read the file
with open('unified-scanner.js', 'r') as f:
    content = f.read()

# Find the old WebSocket pattern in the HTML template
old_pattern = r"const wsUrl = 'ws://' \+ wsHost \+ ':3051';"
new_code = """const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol === 'wss:'
                ? protocol + '//' + wsHost + '/ws'
                : protocol + '//' + wsHost + ':3051';"""

# Replace in the template string
content = content.replace(
    "const wsUrl = 'ws://' + wsHost + ':3051';",
    new_code
)

# Also fix any template literal versions
content = content.replace(
    "const wsUrl = `ws://${wsHost}:3051`;",
    "const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';\n            const wsUrl = protocol === 'wss:' ? `${protocol}//${wsHost}/ws` : `${protocol}//${wsHost}:3051`;"
)

# Write the file back
with open('unified-scanner.js', 'w') as f:
    f.write(content)

print("Fixed WebSocket code in template")
EOF

echo -e "${YELLOW}🔧 Step 3: Applying the fix...${NC}"
python3 fix_template.py
rm fix_template.py

echo -e "${GREEN}✅ Template fixed${NC}"

echo ""
echo -e "${YELLOW}🔍 Step 4: Verifying the fix...${NC}"

# Check if the old pattern still exists
if grep -q "const wsUrl = 'ws://' + wsHost + ':3051'" unified-scanner.js; then
    echo -e "${RED}❌ Old pattern still found!${NC}"
    echo "Manual fix needed at these lines:"
    grep -n "const wsUrl = 'ws://' + wsHost + ':3051'" unified-scanner.js
else
    echo -e "${GREEN}✅ Old pattern removed${NC}"
fi

echo ""
echo -e "${YELLOW}🔄 Step 5: Restarting PM2...${NC}"
pm2 restart market-scanner

echo ""
echo -e "${YELLOW}⏱️ Step 6: Waiting for server to start...${NC}"
sleep 3

echo -e "${YELLOW}🧪 Step 7: Testing the fix...${NC}"
SERVED_HTML=$(curl -s http://localhost:3050/gainers | grep -A3 -B3 "new WebSocket" | head -10)

if echo "$SERVED_HTML" | grep -q "window.location.protocol === 'https:'" ; then
    echo -e "${GREEN}✅ SUCCESS! Server is now serving fixed WebSocket code${NC}"
    echo "Served code:"
    echo "$SERVED_HTML"
else
    echo -e "${RED}❌ Still serving old code${NC}"
    echo "Served code:"
    echo "$SERVED_HTML"
    echo ""
    echo "Checking what line the old code is at:"
    grep -n "ws://' + wsHost + ':3051" unified-scanner.js || echo "Pattern not found directly"
fi

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📋 FIX COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}Now test:${NC}"
echo "1. Clear browser cache (Ctrl+Shift+Delete)"
echo "2. Visit https://daily3club.com/gainers"
echo "3. Check DevTools Console - should work now!"
echo ""
echo -e "${GREEN}The WebSocket should now connect via wss:// on HTTPS${NC}"