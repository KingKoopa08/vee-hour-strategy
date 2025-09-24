#!/bin/bash

# Simple and robust removal of Rising Stocks and Spike Detector

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🗑️  REMOVING FEATURES (SIMPLE METHOD)${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Backing up current file...${NC}"
BACKUP_FILE="unified-scanner.js.backup.$(date +%Y%m%d-%H%M%S)"
cp unified-scanner.js "$BACKUP_FILE"
echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"

echo ""
echo -e "${YELLOW}📋 Step 2: Creating removal script...${NC}"

# Create a Node.js script to properly remove the routes
cat > remove-routes.js << 'EOF'
const fs = require('fs');

// Read the file
let content = fs.readFileSync('unified-scanner.js', 'utf8');

// Find and remove Rising Stocks route
const risingStart = content.indexOf("app.get('/rising',");
if (risingStart !== -1) {
    // Find the closing of this route
    let braceCount = 0;
    let foundStart = false;
    let endPos = risingStart;

    for (let i = risingStart; i < content.length; i++) {
        if (content[i] === '{') {
            braceCount++;
            foundStart = true;
        } else if (content[i] === '}' && foundStart) {
            braceCount--;
            if (braceCount === 0) {
                endPos = i + 3; // Include });\n
                break;
            }
        }
    }

    // Remove the route
    content = content.substring(0, risingStart) + content.substring(endPos);
    console.log('✅ Removed Rising Stocks route');
} else {
    console.log('ℹ️ Rising Stocks route not found');
}

// Find and remove Spike Detector route
const spikesStart = content.indexOf("app.get('/spikes',");
if (spikesStart !== -1) {
    // Find the closing of this route
    let braceCount = 0;
    let foundStart = false;
    let endPos = spikesStart;

    for (let i = spikesStart; i < content.length; i++) {
        if (content[i] === '{') {
            braceCount++;
            foundStart = true;
        } else if (content[i] === '}' && foundStart) {
            braceCount--;
            if (braceCount === 0) {
                endPos = i + 3; // Include });\n
                break;
            }
        }
    }

    // Remove the route
    content = content.substring(0, spikesStart) + content.substring(endPos);
    console.log('✅ Removed Spike Detector route');
} else {
    console.log('ℹ️ Spike Detector route not found');
}

// Remove Rising Stocks links from navigation
content = content.replace(/<a href="\/rising"[^>]*>.*?Rising Stocks.*?<\/a>\n?\s*/g, '');

// Remove Spike Detector links from navigation
content = content.replace(/<a href="\/spikes"[^>]*>.*?Spike Detector.*?<\/a>\n?\s*/g, '');

// Remove Rising Stocks card from home page
content = content.replace(/<a href="\/rising" class="scanner-card">[\s\S]*?<\/a>\n?\s*/g, '');

// Remove Spike Detector card from home page
content = content.replace(/<a href="\/spikes" class="scanner-card">[\s\S]*?<\/a>\n?\s*/g, '');

// Remove console log entries
content = content.replace(/console\.log\(`.*Rising Stocks.*`\);\n?\s*/g, '');
content = content.replace(/console\.log\(`.*Spike Detector.*`\);\n?\s*/g, '');

// Write the modified content back
fs.writeFileSync('unified-scanner.js', content);

console.log('✅ All references removed');
EOF

node remove-routes.js
rm remove-routes.js

echo -e "${GREEN}✅ Routes removed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 3: Killing ALL processes...${NC}"

# Kill all Node processes
pkill -9 -f node 2>/dev/null || true
pkill -9 -f unified-scanner 2>/dev/null || true
pm2 kill 2>/dev/null || true

# Kill processes on ports
fuser -k 3050/tcp 2>/dev/null || true
fuser -k 3051/tcp 2>/dev/null || true

echo -e "${GREEN}✅ All processes killed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 4: Stopping Docker containers...${NC}"

docker-compose -f docker-compose.market-scanner.yml down 2>/dev/null || true
docker rm -f market-scanner market-scanner-ws 2>/dev/null || true

echo -e "${GREEN}✅ Containers stopped${NC}"

echo ""
echo -e "${YELLOW}📋 Step 5: Rebuilding Docker image...${NC}"

docker-compose -f docker-compose.market-scanner.yml build --no-cache

echo -e "${GREEN}✅ Docker image rebuilt${NC}"

echo ""
echo -e "${YELLOW}📋 Step 6: Starting fresh containers...${NC}"

docker-compose -f docker-compose.market-scanner.yml up -d

echo -e "${GREEN}✅ Containers started${NC}"

echo ""
echo -e "${YELLOW}📋 Step 7: Waiting for startup...${NC}"

sleep 5

echo ""
echo -e "${YELLOW}📋 Step 8: Verifying removal...${NC}"

# Check routes in file
echo "File check:"
if grep -q "app.get('/rising'" unified-scanner.js; then
    echo -e "${RED}❌ Rising Stocks route still in file${NC}"
else
    echo -e "${GREEN}✅ Rising Stocks route removed from file${NC}"
fi

if grep -q "app.get('/spikes'" unified-scanner.js; then
    echo -e "${RED}❌ Spike Detector route still in file${NC}"
else
    echo -e "${GREEN}✅ Spike Detector route removed from file${NC}"
fi

# Test live site
echo ""
echo "Live site check:"
RESPONSE=$(curl -s http://localhost:3050 2>/dev/null || echo "ERROR")

if [[ "$RESPONSE" == "ERROR" ]]; then
    echo -e "${RED}❌ Site not responding${NC}"
    docker logs market-scanner --tail 20
else
    if echo "$RESPONSE" | grep -q "/rising"; then
        echo -e "${RED}❌ Rising Stocks link still visible on site${NC}"
    else
        echo -e "${GREEN}✅ Rising Stocks link removed from site${NC}"
    fi

    if echo "$RESPONSE" | grep -q "/spikes"; then
        echo -e "${RED}❌ Spike Detector link still visible on site${NC}"
    else
        echo -e "${GREEN}✅ Spike Detector link removed from site${NC}"
    fi
fi

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}✅ REMOVAL COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo "The site now has:"
echo "• Home page (/)"
echo "• Top Gainers (/gainers)"
echo "• Volume Movers (/volume)"
echo ""
echo "Container status:"
docker ps | grep market- || echo "No containers running"
echo ""
echo "To deploy to production:"
echo "1. git add ."
echo "2. git commit -m 'Remove Rising Stocks and Spike Detector'"
echo "3. git push"
echo "4. Run this script on production server"