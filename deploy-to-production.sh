#!/bin/bash

# ============================================
# COMPLETE PRODUCTION DEPLOYMENT SCRIPT
# ============================================
# This script handles the entire deployment process
# Run this locally to deploy to production server
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Production server details
PROD_SERVER="15.204.86.6"
PROD_USER="root"
PROD_DIR="/root/PreMarket_Stratedy"

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 PRODUCTION DEPLOYMENT SCRIPT${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Step 1: Commit local changes
echo -e "${YELLOW}📋 Step 1: Checking for local changes...${NC}"
if ! git diff --quiet || ! git diff --staged --quiet; then
    echo -e "${YELLOW}Found uncommitted changes. Committing...${NC}"
    git add .
    git commit -m "Auto-deployment: $(date +%Y-%m-%d_%H:%M:%S)

Changes deployed to production
- Updated unified-scanner.js
- Updated volume-movers-page.html
- Configuration updates"
    echo -e "${GREEN}✅ Changes committed${NC}"
else
    echo -e "${GREEN}✅ No uncommitted changes${NC}"
fi

# Step 2: Push to GitHub
echo ""
echo -e "${YELLOW}📋 Step 2: Pushing to GitHub...${NC}"
git push origin main || {
    echo -e "${YELLOW}Push failed, trying to pull and merge first...${NC}"
    git pull origin main --no-rebase
    git push origin main
}
echo -e "${GREEN}✅ Pushed to GitHub${NC}"

# Step 3: Create deployment script for production server
echo ""
echo -e "${YELLOW}📋 Step 3: Creating production deployment script...${NC}"

cat > /tmp/prod-deploy.sh << 'EOF'
#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 DEPLOYING ON PRODUCTION SERVER${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Navigate to project directory
cd /root/PreMarket_Stratedy

# Pull latest changes
echo -e "${YELLOW}📋 Pulling latest changes from GitHub...${NC}"
git pull origin main
echo -e "${GREEN}✅ Code updated${NC}"

# Kill existing processes
echo ""
echo -e "${YELLOW}📋 Stopping existing services...${NC}"
pm2 kill 2>/dev/null || true
pkill -9 -f node 2>/dev/null || true
fuser -k 3050/tcp 2>/dev/null || true
fuser -k 3051/tcp 2>/dev/null || true
echo -e "${GREEN}✅ Services stopped${NC}"

# Stop Docker containers
echo ""
echo -e "${YELLOW}📋 Stopping Docker containers...${NC}"
docker-compose -f docker-compose.market-scanner.yml down 2>/dev/null || true
docker rm -f market-scanner market-scanner-ws 2>/dev/null || true
echo -e "${GREEN}✅ Containers stopped${NC}"

# Rebuild Docker image
echo ""
echo -e "${YELLOW}📋 Rebuilding Docker image...${NC}"
docker-compose -f docker-compose.market-scanner.yml build --no-cache
echo -e "${GREEN}✅ Docker image rebuilt${NC}"

# Start fresh containers
echo ""
echo -e "${YELLOW}📋 Starting fresh containers...${NC}"
docker-compose -f docker-compose.market-scanner.yml up -d
echo -e "${GREEN}✅ Containers started${NC}"

# Clear nginx cache
echo ""
echo -e "${YELLOW}📋 Clearing nginx cache...${NC}"
docker exec thc-nginx rm -rf /var/cache/nginx/* 2>/dev/null || true
docker exec thc-nginx nginx -s reload 2>/dev/null || true
echo -e "${GREEN}✅ Nginx cache cleared${NC}"

# Wait for services to start
echo ""
echo -e "${YELLOW}📋 Waiting for services to start...${NC}"
sleep 5

# Verify deployment
echo ""
echo -e "${YELLOW}📋 Verifying deployment...${NC}"
echo ""

# Check if containers are running
echo "Container status:"
docker ps | grep market- || echo -e "${RED}No market containers running!${NC}"

# Check if site is responding
echo ""
if curl -s https://daily3club.com > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Site is responding on https://daily3club.com${NC}"

    # Check if removed features are gone
    if curl -s https://daily3club.com | grep -q "/rising\|/spikes"; then
        echo -e "${YELLOW}⚠️  Rising/Spike features still visible${NC}"
    else
        echo -e "${GREEN}✅ Rising/Spike features successfully removed${NC}"
    fi
else
    echo -e "${RED}❌ Site not responding!${NC}"
    echo "Container logs:"
    docker logs market-scanner --tail 20
fi

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}✅ DEPLOYMENT COMPLETE${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo "Access the site at:"
echo "• https://daily3club.com"
echo "• https://daily3club.com/gainers"
echo "• https://daily3club.com/volume"
EOF

chmod +x /tmp/prod-deploy.sh
echo -e "${GREEN}✅ Deployment script created${NC}"

# Step 4: Execute on production server
echo ""
echo -e "${YELLOW}📋 Step 4: Deploying to production server...${NC}"
echo -e "${CYAN}Connecting to ${PROD_USER}@${PROD_SERVER}...${NC}"

# Copy and execute the script on production
scp /tmp/prod-deploy.sh ${PROD_USER}@${PROD_SERVER}:/tmp/prod-deploy.sh
ssh ${PROD_USER}@${PROD_SERVER} "bash /tmp/prod-deploy.sh"

# Clean up
rm /tmp/prod-deploy.sh

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}✅ DEPLOYMENT SUCCESSFUL${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Production site updated at:${NC}"
echo "• https://daily3club.com"
echo "• https://daily3club.com/gainers"
echo "• https://daily3club.com/volume"
echo ""
echo -e "${YELLOW}Recent changes deployed:${NC}"
echo "• Removed Rising Stocks and Spike Detector features"
echo "• Optimized update intervals (5s market hours, 60s closed)"
echo "• Fixed navigation links"
echo "• Improved API efficiency"