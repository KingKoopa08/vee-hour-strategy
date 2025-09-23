#!/bin/bash

# Quick Update Script
# For updating code without full redeploy
# Usage: bash update.sh

set -e

# Configuration
APP_DIR="$HOME/vee-hour-strategy"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}🔄 QUICK UPDATE${NC}"
echo -e "${GREEN}===============================================${NC}"

# Navigate to app directory
cd "$APP_DIR"

# Pull latest code
echo -e "${YELLOW}📦 Pulling latest code...${NC}"
git fetch --all
git reset --hard origin/main
git pull origin main

# Update dependencies if needed
if git diff HEAD@{1} --name-only | grep -q "package.json"; then
    echo -e "${YELLOW}📦 package.json changed, updating dependencies...${NC}"
    npm install --legacy-peer-deps
fi

# Restart services
echo -e "${YELLOW}🔄 Restarting services...${NC}"
pm2 restart market-scanner

# Show status
echo -e "${GREEN}✅ Update complete!${NC}"
pm2 status
echo ""
echo -e "${GREEN}📝 Recent logs:${NC}"
pm2 logs market-scanner --lines 10 --nostream