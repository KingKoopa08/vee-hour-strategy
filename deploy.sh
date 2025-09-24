#!/bin/bash

# ============================================
# PRODUCTION DEPLOYMENT SCRIPT
# Run this directly on the production server
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 DEPLOYING TO PRODUCTION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Step 1: Pull latest changes from GitHub
echo -e "${YELLOW}📋 Step 1: Pulling latest changes from GitHub...${NC}"
cd /root/PreMarket_Stratedy
git pull origin main
echo -e "${GREEN}✅ Code updated${NC}"

# Step 2: Stop existing services
echo ""
echo -e "${YELLOW}📋 Step 2: Stopping existing services...${NC}"
pm2 kill 2>/dev/null || true
pkill -9 -f node 2>/dev/null || true
fuser -k 3050/tcp 2>/dev/null || true
fuser -k 3051/tcp 2>/dev/null || true
echo -e "${GREEN}✅ Services stopped${NC}"

# Step 3: Stop Docker containers
echo ""
echo -e "${YELLOW}📋 Step 3: Stopping Docker containers...${NC}"
docker-compose -f docker-compose.market-scanner.yml down 2>/dev/null || true
docker rm -f market-scanner market-scanner-ws 2>/dev/null || true
echo -e "${GREEN}✅ Containers stopped${NC}"

# Step 4: Rebuild Docker image (with cache for faster builds)
echo ""
echo -e "${YELLOW}📋 Step 4: Building Docker image...${NC}"
echo "Use --no-cache flag if you need a clean rebuild"
docker-compose -f docker-compose.market-scanner.yml build
echo -e "${GREEN}✅ Docker image built${NC}"

# Step 5: Start fresh containers
echo ""
echo -e "${YELLOW}📋 Step 5: Starting containers...${NC}"
docker-compose -f docker-compose.market-scanner.yml up -d
echo -e "${GREEN}✅ Containers started${NC}"

# Step 6: Clear nginx cache
echo ""
echo -e "${YELLOW}📋 Step 6: Clearing nginx cache...${NC}"
docker exec thc-nginx rm -rf /var/cache/nginx/* 2>/dev/null || true
docker exec thc-nginx nginx -s reload 2>/dev/null || true
echo -e "${GREEN}✅ Nginx cache cleared${NC}"

# Step 7: Wait for services to start
echo ""
echo -e "${YELLOW}📋 Step 7: Waiting for services to start...${NC}"
sleep 5

# Step 8: Verify deployment
echo ""
echo -e "${YELLOW}📋 Step 8: Verifying deployment...${NC}"
echo ""

# Check container status
echo "Container status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep market- || echo -e "${RED}No market containers running!${NC}"

# Check if site is responding
echo ""
echo "Testing site response..."
if curl -s https://daily3club.com > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Site is responding on https://daily3club.com${NC}"

    # Check specific pages
    echo ""
    echo "Testing pages:"
    for page in "" "/gainers" "/volume"; do
        if curl -s "https://daily3club.com${page}" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ https://daily3club.com${page} is working${NC}"
        else
            echo -e "${RED}❌ https://daily3club.com${page} is not responding${NC}"
        fi
    done

    # Check if removed features are gone
    echo ""
    if curl -s https://daily3club.com | grep -q "/rising\|/spikes"; then
        echo -e "${YELLOW}⚠️  Old features (Rising/Spike) still visible - may need cache clear${NC}"
    else
        echo -e "${GREEN}✅ Old features successfully removed${NC}"
    fi
else
    echo -e "${RED}❌ Site not responding!${NC}"
    echo ""
    echo "Container logs:"
    docker logs market-scanner --tail 30
fi

# Step 9: Show container logs
echo ""
echo -e "${YELLOW}📋 Recent container logs:${NC}"
docker logs market-scanner --tail 10

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}✅ DEPLOYMENT COMPLETE${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo "Site URLs:"
echo "• https://daily3club.com"
echo "• https://daily3club.com/gainers"
echo "• https://daily3club.com/volume"
echo ""
echo "Monitoring commands:"
echo "• docker logs -f market-scanner"
echo "• docker ps | grep market-"
echo "• curl -s https://daily3club.com | head -20"
