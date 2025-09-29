#!/bin/bash

# ============================================
# QUICK UPDATE SCRIPT
# Updates code and restarts service
# Usage: ./update-production.sh [server-ip]
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SERVER_IP="${1}"

if [ -z "$SERVER_IP" ]; then
    echo -e "${YELLOW}Running update locally...${NC}"

    # Local update
    cd /opt/premarket-scanner

    echo -e "${YELLOW}📋 Pulling latest code...${NC}"
    git pull

    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install --production

    echo -e "${YELLOW}🔄 Restarting service...${NC}"
    pm2 restart market-scanner

    echo -e "${GREEN}✅ Update complete!${NC}"
    pm2 status
else
    echo -e "${CYAN}🔄 UPDATING SERVER: ${SERVER_IP}${NC}"

    # Remote update via SSH
    ssh root@${SERVER_IP} << 'REMOTE_UPDATE'
    set -e

    cd /opt/premarket-scanner

    echo "📋 Pulling latest code..."
    git pull

    echo "📦 Installing dependencies..."
    npm install --production

    echo "🔄 Restarting service..."
    pm2 restart market-scanner

    echo "✅ Update complete!"
    pm2 status
REMOTE_UPDATE

    echo -e "${GREEN}✅ Server updated successfully!${NC}"
fi