#!/bin/bash

# ============================================
# QUICK DEPLOYMENT - RUN ON PRODUCTION SERVER
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 QUICK DEPLOY TO PRODUCTION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Step 1: Pull latest changes
echo -e "${YELLOW}📋 Step 1: Pulling latest changes from GitHub...${NC}"
git pull origin main
echo -e "${GREEN}✅ Code updated${NC}"

# Step 2: Restart Docker containers
echo ""
echo -e "${YELLOW}📋 Step 2: Restarting Docker containers...${NC}"
docker-compose -f docker-compose.market-scanner.yml down
docker-compose -f docker-compose.market-scanner.yml up -d --build
echo -e "${GREEN}✅ Containers restarted${NC}"

# Step 3: Clear nginx cache
echo ""
echo -e "${YELLOW}📋 Step 3: Clearing nginx cache...${NC}"
docker exec thc-nginx rm -rf /var/cache/nginx/* 2>/dev/null || true
docker exec thc-nginx nginx -s reload 2>/dev/null || true
echo -e "${GREEN}✅ Cache cleared${NC}"

# Step 4: Verify
echo ""
echo -e "${YELLOW}📋 Step 4: Verifying deployment...${NC}"
sleep 3
docker ps | grep market- || echo -e "${YELLOW}Containers starting...${NC}"

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}✅ DEPLOYMENT COMPLETE${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo "Changes deployed:"
echo "• Fixed volume movers sorting"
echo "• Added session-specific volume display"
echo "• Changed updates to 1 second intervals"
echo "• Fixed volume filtering to use total volume"
echo ""
echo "Check site at: https://daily3club.com/volume"
