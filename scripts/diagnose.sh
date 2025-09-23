#!/bin/bash

# Diagnostic Script - Check what's wrong with production
# Usage: bash diagnose.sh

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔍 PRODUCTION DIAGNOSTICS${NC}"
echo -e "${CYAN}===============================================${NC}"

# Check which API key is being used
echo -e "${YELLOW}🔑 Checking API Key Configuration:${NC}"

# Check .env file
if [ -f .env ]; then
    echo -e "${GREEN}✅ .env file exists${NC}"
    API_KEY=$(grep POLYGON_API_KEY .env | cut -d'=' -f2)
    if [ "$API_KEY" = "KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV" ]; then
        echo -e "${GREEN}✅ NEW API key is in .env${NC}"
    else
        echo -e "${RED}❌ OLD API key detected: ${API_KEY:0:20}...${NC}"
    fi
else
    echo -e "${RED}❌ .env file NOT FOUND${NC}"
fi

# Check if environment variable is set
echo ""
echo -e "${YELLOW}🔍 Checking Environment Variables:${NC}"
if [ ! -z "$POLYGON_API_KEY" ]; then
    echo "   ENV POLYGON_API_KEY: ${POLYGON_API_KEY:0:20}..."
else
    echo "   ENV POLYGON_API_KEY: (not set)"
fi

# Check running process
echo ""
echo -e "${YELLOW}📊 Checking Running Process:${NC}"
PM2_INFO=$(pm2 info market-scanner 2>/dev/null | grep -E "exec cwd|status|uptime|restarts")
if [ ! -z "$PM2_INFO" ]; then
    echo "$PM2_INFO"

    # Get the actual running directory
    EXEC_DIR=$(pm2 info market-scanner 2>/dev/null | grep "exec cwd" | awk -F': ' '{print $2}' | tr -d ' ')
    if [ ! -z "$EXEC_DIR" ]; then
        echo -e "${YELLOW}   Running from: $EXEC_DIR${NC}"

        # Check .env in the running directory
        if [ -f "$EXEC_DIR/.env" ]; then
            RUNNING_KEY=$(grep POLYGON_API_KEY "$EXEC_DIR/.env" | cut -d'=' -f2)
            if [ "$RUNNING_KEY" = "KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV" ]; then
                echo -e "${GREEN}   ✅ Running with NEW API key${NC}"
            else
                echo -e "${RED}   ❌ Running with OLD API key${NC}"
            fi
        fi
    fi
else
    echo -e "${RED}❌ market-scanner not running in PM2${NC}"
fi

# Test current API key
echo ""
echo -e "${YELLOW}🔑 Testing API Key Validity:${NC}"

# Create test script
cat > /tmp/test-api.js << 'EOF'
const axios = require('axios');
const fs = require('fs');

// Try to load from .env
let apiKey = 'KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV'; // New key
if (fs.existsSync('.env')) {
    const env = fs.readFileSync('.env', 'utf8');
    const match = env.match(/POLYGON_API_KEY=(.+)/);
    if (match) apiKey = match[1].trim();
}

console.log(`Testing key: ${apiKey.substring(0, 20)}...`);

axios.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=${apiKey}&limit=1`)
    .then(res => {
        console.log('✅ API Key is VALID');
        console.log(`   Status: ${res.data.status}`);
        console.log(`   Count: ${res.data.count}`);
    })
    .catch(err => {
        console.log('❌ API Key FAILED');
        console.log(`   Error: ${err.response?.status} ${err.response?.statusText || err.message}`);
    });
EOF

node /tmp/test-api.js
rm -f /tmp/test-api.js

# Check for multiple installations
echo ""
echo -e "${YELLOW}📁 Checking for Multiple Installations:${NC}"
echo "Looking for vee-hour-strategy directories..."
find ~ -type d -name "vee-hour-strategy" 2>/dev/null | head -10

# Check PM2 logs for errors
echo ""
echo -e "${YELLOW}📝 Recent Error Logs:${NC}"
pm2 logs market-scanner --err --lines 5 --nostream 2>/dev/null || echo "(no recent errors)"

# Memory check
echo ""
echo -e "${YELLOW}💾 Memory Usage:${NC}"
free -h | grep -E "^Mem:"

# Recommendations
echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}💡 RECOMMENDATIONS:${NC}"
echo -e "${CYAN}===============================================${NC}"

if [ "$API_KEY" != "KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV" ] || [ "$RUNNING_KEY" != "KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV" ]; then
    echo -e "${RED}⚠️  OLD API KEY DETECTED!${NC}"
    echo ""
    echo "Run this to fix:"
    echo -e "${GREEN}./scripts/rebuild.sh${NC}"
    echo ""
    echo "OR manually update:"
    echo "1. Edit .env file: nano .env"
    echo "2. Set: POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV"
    echo "3. Restart: pm2 restart market-scanner"
else
    echo -e "${GREEN}✅ Configuration looks correct${NC}"
    echo ""
    echo "If still having issues, try:"
    echo -e "${GREEN}./scripts/rebuild.sh${NC}"
fi