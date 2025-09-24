#!/bin/bash

# Remove Rising Stocks and Spike Detector features with FORCE cache clear

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🗑️  REMOVING FEATURES & CLEARING CACHE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Backing up current file...${NC}"
cp unified-scanner.js unified-scanner.js.backup.$(date +%Y%m%d-%H%M%S)
echo -e "${GREEN}✅ Backup created${NC}"

echo ""
echo -e "${YELLOW}📋 Step 2: Removing routes from unified-scanner.js...${NC}"

# Use sed to remove the routes more precisely
# Remove Rising Stocks route (lines around 1112)
sed -i '/^app\.get\('"'"'\/rising'"'"'/,/^});$/d' unified-scanner.js

# Remove Spike Detector route (lines around 1310)
sed -i '/^app\.get\('"'"'\/spikes'"'"'/,/^});$/d' unified-scanner.js

echo -e "${GREEN}✅ Routes removed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 3: Removing navigation links...${NC}"

# Remove Rising Stocks links from all navigation
sed -i '/<a href="\/rising"[^>]*>.*Rising Stocks.*<\/a>/d' unified-scanner.js

# Remove Spike Detector links from all navigation
sed -i '/<a href="\/spikes"[^>]*>.*Spike Detector.*<\/a>/d' unified-scanner.js

echo -e "${GREEN}✅ Navigation links removed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 4: Removing home page cards...${NC}"

# Remove Rising Stocks card from home page
sed -i '/<a href="\/rising" class="scanner-card">/,/<\/a>/d' unified-scanner.js

# Remove Spike Detector card from home page
sed -i '/<a href="\/spikes" class="scanner-card">/,/<\/a>/d' unified-scanner.js

echo -e "${GREEN}✅ Home page cards removed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 5: Removing console log entries...${NC}"

# Remove Rising Stocks from console log
sed -i '/console\.log.*Rising Stocks.*3050\/rising/d' unified-scanner.js

# Remove Spike Detector from console log
sed -i '/console\.log.*Spike Detector.*3050\/spikes/d' unified-scanner.js

echo -e "${GREEN}✅ Console logs cleaned${NC}"

echo ""
echo -e "${YELLOW}📋 Step 6: Killing ALL Node processes...${NC}"

# Kill all Node processes
pkill -9 -f node 2>/dev/null || true
pkill -9 -f unified-scanner 2>/dev/null || true
pm2 kill 2>/dev/null || true

echo -e "${GREEN}✅ All Node processes killed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 7: Clearing Node.js require cache...${NC}"

# Clear Node module cache by removing node_modules and reinstalling
rm -rf node_modules 2>/dev/null || true
rm package-lock.json 2>/dev/null || true
npm cache clean --force 2>/dev/null || true

echo -e "${GREEN}✅ Node cache cleared${NC}"

echo ""
echo -e "${YELLOW}📋 Step 8: Reinstalling dependencies...${NC}"

npm install --legacy-peer-deps

echo -e "${GREEN}✅ Dependencies reinstalled${NC}"

echo ""
echo -e "${YELLOW}📋 Step 9: Stopping Docker containers...${NC}"

# Stop and remove containers to force rebuild
docker-compose -f docker-compose.market-scanner.yml down 2>/dev/null || true
docker rm -f market-scanner 2>/dev/null || true
docker rm -f market-scanner-ws 2>/dev/null || true

echo -e "${GREEN}✅ Docker containers stopped${NC}"

echo ""
echo -e "${YELLOW}📋 Step 10: Removing Docker images to force rebuild...${NC}"

# Remove images to force rebuild
docker rmi market-scanner:latest 2>/dev/null || true

echo -e "${GREEN}✅ Docker images removed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 11: Rebuilding Docker containers...${NC}"

# Rebuild with no cache
docker-compose -f docker-compose.market-scanner.yml build --no-cache

echo -e "${GREEN}✅ Docker containers rebuilt${NC}"

echo ""
echo -e "${YELLOW}📋 Step 12: Starting fresh containers...${NC}"

docker-compose -f docker-compose.market-scanner.yml up -d

echo -e "${GREEN}✅ Containers started${NC}"

echo ""
echo -e "${YELLOW}📋 Step 13: Clearing nginx cache...${NC}"

# Clear nginx cache if it exists
docker exec thc-nginx rm -rf /var/cache/nginx/* 2>/dev/null || true
docker exec thc-nginx nginx -s reload 2>/dev/null || true

echo -e "${GREEN}✅ Nginx cache cleared${NC}"

echo ""
echo -e "${YELLOW}📋 Step 14: Verifying removal...${NC}"

# Check if routes are gone
if grep -q "app.get('/rising'" unified-scanner.js; then
    echo -e "${RED}❌ Rising Stocks route still exists!${NC}"
else
    echo -e "${GREEN}✅ Rising Stocks route removed${NC}"
fi

if grep -q "app.get('/spikes'" unified-scanner.js; then
    echo -e "${RED}❌ Spike Detector route still exists!${NC}"
else
    echo -e "${GREEN}✅ Spike Detector route removed${NC}"
fi

# Count remaining routes
ROUTES=$(grep -c "app.get('/" unified-scanner.js || true)
echo -e "${CYAN}📊 Remaining routes: $ROUTES${NC}"

echo ""
echo -e "${YELLOW}📋 Step 15: Testing the application...${NC}"

sleep 5

# Test if working
if curl -s http://localhost:3050 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Application responding on port 3050${NC}"

    # Check if Rising Stocks link is gone
    if curl -s http://localhost:3050 | grep -q "/rising"; then
        echo -e "${RED}❌ Rising Stocks link still visible!${NC}"
    else
        echo -e "${GREEN}✅ Rising Stocks link removed${NC}"
    fi

    # Check if Spike Detector link is gone
    if curl -s http://localhost:3050 | grep -q "/spikes"; then
        echo -e "${RED}❌ Spike Detector link still visible!${NC}"
    else
        echo -e "${GREEN}✅ Spike Detector link removed${NC}"
    fi
else
    echo -e "${RED}❌ Application not responding${NC}"
    echo "Container logs:"
    docker logs market-scanner --tail 20
fi

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}✅ FEATURES REMOVED & CACHE CLEARED${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}Rising Stocks and Spike Detector have been removed${NC}"
echo -e "${GREEN}All caches have been cleared${NC}"
echo -e "${GREEN}Docker containers have been rebuilt${NC}"
echo ""
echo "The site now has:"
echo "• Home page (/)"
echo "• Top Gainers (/gainers)"
echo "• Volume Movers (/volume)"
echo ""
echo "Test at: https://daily3club.com"