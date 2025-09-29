#!/bin/bash

# ============================================
# QUICK UPDATE SCRIPT
# Run this on server to update the app
# Usage: ./update.sh
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

APP_DIR="/opt/premarket-scanner"

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔄 UPDATING PREMARKET SCANNER${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Navigate to app directory
cd $APP_DIR

# If using git
if [ -d .git ]; then
    echo -e "${YELLOW}📋 Pulling latest code from git...${NC}"
    git stash
    git pull origin main || git pull origin master
    echo -e "${GREEN}✅ Code updated${NC}"
else
    echo -e "${YELLOW}📋 No git repository found${NC}"
    echo -e "${YELLOW}   Copy files manually or clone from git${NC}"
fi

# Update npm packages
echo -e "${YELLOW}📦 Updating npm packages...${NC}"
npm install --production

# Restart service
echo -e "${YELLOW}🔄 Restarting service...${NC}"
pm2 restart market-scanner

# Wait for service to start
sleep 3

# Check status
echo -e "${YELLOW}🔍 Checking status...${NC}"
pm2 status market-scanner

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ UPDATE COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "View logs: ${CYAN}pm2 logs market-scanner${NC}"