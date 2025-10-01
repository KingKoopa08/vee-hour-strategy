#!/bin/bash

# Quick fix deployment to production
# This script updates only the unified-scanner.js file

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 DEPLOYING FIX TO PRODUCTION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check if we have the production server info
if [ -z "$PRODUCTION_SERVER" ]; then
    PRODUCTION_SERVER="root@daily3club.com"
    echo -e "${YELLOW}Using default server: ${PRODUCTION_SERVER}${NC}"
fi

echo -e "${YELLOW}📋 Backing up current file on production...${NC}"
ssh ${PRODUCTION_SERVER} "cd /opt/premarket-scanner && cp unified-scanner.js unified-scanner.js.backup.$(date +%Y%m%d-%H%M%S)" || true

echo -e "${YELLOW}📋 Uploading fixed unified-scanner.js...${NC}"
scp unified-scanner.js ${PRODUCTION_SERVER}:/opt/premarket-scanner/unified-scanner.js

echo -e "${YELLOW}📋 Restarting market scanner service...${NC}"
ssh ${PRODUCTION_SERVER} "pm2 restart market-scanner"

echo -e "${YELLOW}📋 Waiting for service to start...${NC}"
sleep 5

echo -e "${YELLOW}📋 Checking service status...${NC}"
ssh ${PRODUCTION_SERVER} "pm2 list | grep market-scanner"

echo ""
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo ""
echo -e "${CYAN}View logs:${NC}"
echo -e "  ssh ${PRODUCTION_SERVER} -t 'pm2 logs market-scanner --lines 50'"
echo ""
echo -e "${CYAN}Check status:${NC}"
echo -e "  https://daily3club.com"
echo ""
