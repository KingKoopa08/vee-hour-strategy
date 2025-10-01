#!/bin/bash

# ============================================
# PRODUCTION REBUILD - Clear Cache & Deploy
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PRODUCTION_SERVER="${PRODUCTION_SERVER:-root@daily3club.com}"
APP_DIR="/opt/premarket-scanner"
SERVICE_NAME="market-scanner"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 REBUILDING PRODUCTION (NO CACHE)${NC}"
echo -e "${CYAN}   Server: ${PRODUCTION_SERVER}${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Step 1: Backup current file on production
echo -e "${YELLOW}📋 Step 1/6: Backing up current production file...${NC}"
ssh ${SSH_OPTS} ${PRODUCTION_SERVER} "cd ${APP_DIR} && cp unified-scanner.js unified-scanner.js.backup.\$(date +%Y%m%d-%H%M%S)" || true
echo -e "${GREEN}✅ Backup complete${NC}"
echo ""

# Step 2: Upload fixed file
echo -e "${YELLOW}📋 Step 2/6: Uploading fixed unified-scanner.js...${NC}"
scp ${SSH_OPTS} unified-scanner.js ${PRODUCTION_SERVER}:${APP_DIR}/unified-scanner.js
echo -e "${GREEN}✅ File uploaded${NC}"
echo ""

# Step 3: Stop PM2 service
echo -e "${YELLOW}📋 Step 3/6: Stopping PM2 service...${NC}"
ssh ${PRODUCTION_SERVER} "pm2 stop ${SERVICE_NAME} 2>/dev/null || true"
ssh ${PRODUCTION_SERVER} "pm2 delete ${SERVICE_NAME} 2>/dev/null || true"
echo -e "${GREEN}✅ Service stopped${NC}"
echo ""

# Step 4: Clear any cached/running processes
echo -e "${YELLOW}📋 Step 4/6: Clearing ports and processes...${NC}"
ssh ${PRODUCTION_SERVER} "sudo fuser -k 3050/tcp 2>/dev/null || true"
ssh ${PRODUCTION_SERVER} "sudo fuser -k 3051/tcp 2>/dev/null || true"
echo -e "${GREEN}✅ Ports cleared${NC}"
echo ""

# Step 5: Reinstall dependencies (clears node_modules cache)
echo -e "${YELLOW}📋 Step 5/6: Reinstalling dependencies (clearing cache)...${NC}"
ssh ${PRODUCTION_SERVER} "cd ${APP_DIR} && rm -rf node_modules package-lock.json && npm install --production"
echo -e "${GREEN}✅ Dependencies reinstalled${NC}"
echo ""

# Step 6: Start fresh PM2 service
echo -e "${YELLOW}📋 Step 6/6: Starting fresh PM2 service...${NC}"
ssh ${PRODUCTION_SERVER} "cd ${APP_DIR} && pm2 start unified-scanner.js --name ${SERVICE_NAME} \
    --max-memory-restart 1G \
    --log-date-format='YYYY-MM-DD HH:mm:ss' \
    --merge-logs \
    --time"

ssh ${PRODUCTION_SERVER} "pm2 save"
echo -e "${GREEN}✅ Service started${NC}"
echo ""

# Step 7: Wait and verify
echo -e "${YELLOW}📋 Verifying deployment...${NC}"
sleep 8

echo -e "${YELLOW}Checking PM2 status...${NC}"
ssh ${PRODUCTION_SERVER} "pm2 list | grep ${SERVICE_NAME}"

echo ""
echo -e "${YELLOW}Checking recent logs for errors...${NC}"
ssh ${PRODUCTION_SERVER} "pm2 logs ${SERVICE_NAME} --lines 30 --nostream | grep -E 'Error|error|Cannot access|EADDRINUSE' || echo 'No errors found in recent logs'"

echo ""
echo -e "${YELLOW}Testing HTTP endpoint...${NC}"
sleep 2
TEST_RESULT=$(ssh ${PRODUCTION_SERVER} "curl -s http://localhost:3050/api/gainers | head -c 100" || echo "FAILED")
if [[ "$TEST_RESULT" == "FAILED" ]] || [[ -z "$TEST_RESULT" ]]; then
    echo -e "${RED}❌ HTTP endpoint not responding${NC}"
    echo -e "${YELLOW}Showing last 50 lines of logs:${NC}"
    ssh ${PRODUCTION_SERVER} "pm2 logs ${SERVICE_NAME} --lines 50 --nostream"
    exit 1
else
    echo -e "${GREEN}✅ HTTP endpoint responding${NC}"
fi

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ PRODUCTION REBUILD COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Your scanner is live at:${NC}"
echo -e "  ${CYAN}https://daily3club.com${NC}"
echo -e "  ${CYAN}https://daily3club.com/volume${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  View live logs:  ${CYAN}ssh ${PRODUCTION_SERVER} -t 'pm2 logs ${SERVICE_NAME}'${NC}"
echo -e "  Monitor:         ${CYAN}ssh ${PRODUCTION_SERVER} -t 'pm2 monit'${NC}"
echo -e "  Check status:    ${CYAN}ssh ${PRODUCTION_SERVER} -t 'pm2 status'${NC}"
echo -e "  Restart:         ${CYAN}ssh ${PRODUCTION_SERVER} -t 'pm2 restart ${SERVICE_NAME}'${NC}"
echo ""
