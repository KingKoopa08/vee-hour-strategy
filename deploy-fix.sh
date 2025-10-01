#!/bin/bash

# ============================================
# PRODUCTION DEPLOYMENT SCRIPT
# Run this on the production server after git pull
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
APP_DIR="/opt/premarket-scanner"
SERVICE_NAME="market-scanner"

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 DEPLOYING UNIFIED SCANNER FIX${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Step 1: Verify we're in the right directory
if [ ! -f "unified-scanner.js" ]; then
    echo -e "${RED}❌ Error: unified-scanner.js not found${NC}"
    echo -e "${YELLOW}Please run this script from ${APP_DIR}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found unified-scanner.js${NC}"
echo ""

# Step 2: Backup current file
echo -e "${YELLOW}📋 Step 1/6: Backing up current version...${NC}"
BACKUP_FILE="unified-scanner.js.backup.$(date +%Y%m%d-%H%M%S)"
cp unified-scanner.js "$BACKUP_FILE"
echo -e "${GREEN}✅ Backed up to: $BACKUP_FILE${NC}"
echo ""

# Step 3: Stop PM2 service
echo -e "${YELLOW}📋 Step 2/6: Stopping PM2 service...${NC}"
if pm2 list | grep -q "$SERVICE_NAME"; then
    pm2 stop "$SERVICE_NAME" 2>/dev/null || true
    pm2 delete "$SERVICE_NAME" 2>/dev/null || true
    echo -e "${GREEN}✅ Service stopped${NC}"
else
    echo -e "${YELLOW}⚠️  Service was not running${NC}"
fi
echo ""

# Step 4: Kill any processes on our ports
echo -e "${YELLOW}📋 Step 3/6: Clearing ports...${NC}"
sudo fuser -k 3050/tcp 2>/dev/null || true
sudo fuser -k 3051/tcp 2>/dev/null || true
sleep 2
echo -e "${GREEN}✅ Ports cleared${NC}"
echo ""

# Step 5: Clear node_modules cache
echo -e "${YELLOW}📋 Step 4/6: Clearing node_modules cache...${NC}"
if [ -d "node_modules" ]; then
    rm -rf node_modules
    echo -e "${GREEN}✅ node_modules removed${NC}"
fi
if [ -f "package-lock.json" ]; then
    rm -f package-lock.json
    echo -e "${GREEN}✅ package-lock.json removed${NC}"
fi
echo ""

# Step 6: Reinstall dependencies
echo -e "${YELLOW}📋 Step 5/6: Installing dependencies...${NC}"
npm install --production
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 7: Start PM2 service
echo -e "${YELLOW}📋 Step 6/6: Starting PM2 service...${NC}"
pm2 start unified-scanner.js --name "$SERVICE_NAME" \
    --max-memory-restart 1G \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --merge-logs \
    --time

pm2 save
echo -e "${GREEN}✅ Service started${NC}"
echo ""

# Step 8: Wait for startup
echo -e "${YELLOW}⏳ Waiting for service to initialize...${NC}"
sleep 5
echo ""

# Step 9: Verify deployment
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 VERIFYING DEPLOYMENT${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check PM2 status
echo -e "${YELLOW}Checking PM2 status...${NC}"
if pm2 list | grep -q "$SERVICE_NAME"; then
    pm2 list | grep "$SERVICE_NAME"
    echo -e "${GREEN}✅ PM2 service is running${NC}"
else
    echo -e "${RED}❌ PM2 service not found${NC}"
    exit 1
fi
echo ""

# Check for errors in logs
echo -e "${YELLOW}Checking logs for errors...${NC}"
ERROR_COUNT=$(pm2 logs "$SERVICE_NAME" --lines 50 --nostream 2>/dev/null | grep -i "cannot access\|error processing volume movers" | wc -l)
if [ "$ERROR_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ No 'Cannot access movers' errors found${NC}"
else
    echo -e "${RED}❌ Found $ERROR_COUNT error(s) in logs${NC}"
    echo -e "${YELLOW}Recent logs:${NC}"
    pm2 logs "$SERVICE_NAME" --lines 30 --nostream
    exit 1
fi
echo ""

# Test HTTP endpoint
echo -e "${YELLOW}Testing HTTP endpoint...${NC}"
if curl -s http://localhost:3050/api/gainers | head -c 50 | grep -q "symbol"; then
    echo -e "${GREEN}✅ API endpoint responding${NC}"
else
    echo -e "${RED}❌ API endpoint not responding properly${NC}"
    exit 1
fi
echo ""

# Show recent logs
echo -e "${YELLOW}Recent logs (last 20 lines):${NC}"
echo -e "${CYAN}--------------------------------------------${NC}"
pm2 logs "$SERVICE_NAME" --lines 20 --nostream
echo -e "${CYAN}--------------------------------------------${NC}"
echo ""

# Final summary
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Your scanner is now running with the fix!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Open: ${CYAN}https://daily3club.com${NC}"
echo -e "  2. Verify data is updating every second"
echo -e "  3. Check browser console for errors (should be none)"
echo ""
echo -e "${YELLOW}Monitor with:${NC}"
echo -e "  ${CYAN}pm2 logs $SERVICE_NAME${NC}       - View live logs"
echo -e "  ${CYAN}pm2 monit${NC}                  - Resource monitor"
echo -e "  ${CYAN}pm2 status${NC}                 - Service status"
echo ""
echo -e "${YELLOW}Backup location:${NC}"
echo -e "  ${CYAN}$BACKUP_FILE${NC}"
echo ""
