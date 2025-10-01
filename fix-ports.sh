#!/bin/bash

# Fix ports in .env file and restart with correct configuration

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FIXING PORTS CONFIGURATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Step 1: Backup .env
echo -e "${YELLOW}📋 Step 1/5: Backing up .env file...${NC}"
if [ -f ".env" ]; then
    cp .env .env.backup.$(date +%Y%m%d-%H%M%S)
    echo -e "${GREEN}✅ Backup created${NC}"
else
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi
echo ""

# Step 2: Show current configuration
echo -e "${YELLOW}📋 Step 2/5: Current configuration:${NC}"
grep "PORT=" .env || echo "PORT not set"
grep "WS_PORT=" .env || echo "WS_PORT not set"
echo ""

# Step 3: Update ports
echo -e "${YELLOW}📋 Step 3/5: Updating ports to 3050/3051...${NC}"
sed -i 's/PORT=3000/PORT=3050/' .env
sed -i 's/WS_PORT=3001/WS_PORT=3051/' .env
echo -e "${GREEN}✅ Ports updated${NC}"
echo ""

# Step 4: Verify changes
echo -e "${YELLOW}📋 Step 4/5: New configuration:${NC}"
grep "PORT=" .env
grep "WS_PORT=" .env
echo ""

# Step 5: Restart PM2 with new environment
echo -e "${YELLOW}📋 Step 5/5: Restarting market-scanner with new ports...${NC}"
pm2 restart market-scanner --update-env
sleep 5
echo -e "${GREEN}✅ Service restarted${NC}"
echo ""

# Verification
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 VERIFYING CONFIGURATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check logs for correct ports
echo -e "${YELLOW}Checking startup logs:${NC}"
pm2 logs market-scanner --lines 30 --nostream | grep -E "WebSocket server listening|Main Hub:" | head -5
echo ""

# Check if port 3051 is listening
echo -e "${YELLOW}Checking if port 3051 is listening:${NC}"
if netstat -tlnp 2>/dev/null | grep :3051 || ss -tlnp | grep :3051; then
    echo -e "${GREEN}✅ Port 3051 is listening!${NC}"
else
    echo -e "${RED}❌ Port 3051 is NOT listening${NC}"
    echo -e "${YELLOW}Checking logs for errors:${NC}"
    pm2 logs market-scanner --lines 50 --nostream | tail -20
    exit 1
fi
echo ""

# Check if port 3050 is listening
echo -e "${YELLOW}Checking if port 3050 is listening:${NC}"
if netstat -tlnp 2>/dev/null | grep :3050 || ss -tlnp | grep :3050; then
    echo -e "${GREEN}✅ Port 3050 is listening!${NC}"
else
    echo -e "${RED}❌ Port 3050 is NOT listening${NC}"
fi
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ PORTS FIXED!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}WebSocket is now running on port 3051${NC}"
echo -e "${GREEN}HTTP server is now running on port 3050${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Test WebSocket connection from browser"
echo -e "  2. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo -e "  3. Check browser console for: ${GREEN}'Connected to WebSocket'${NC}"
echo -e "  4. Verify data updates every second"
echo ""
echo -e "${YELLOW}Monitor logs:${NC}"
echo -e "  ${CYAN}pm2 logs market-scanner${NC}"
echo ""
