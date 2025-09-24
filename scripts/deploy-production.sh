#!/bin/bash

# Deploy changes to production with cache clearing

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🚀 DEPLOYING TO PRODUCTION${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Committing changes...${NC}"

# Check for changes
if git diff --quiet && git diff --staged --quiet; then
    echo -e "${YELLOW}No changes to commit${NC}"
else
    git add .
    git commit -m "Remove Rising Stocks and Spike Detector features

- Removed /rising and /spikes routes
- Updated navigation to show only Gainers and Volume
- Cleaned up API endpoint documentation
- Fixed navigation links across all pages"
    echo -e "${GREEN}✅ Changes committed${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Step 2: Pushing to repository...${NC}"

git push origin main
echo -e "${GREEN}✅ Pushed to GitHub${NC}"

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}PRODUCTION DEPLOYMENT INSTRUCTIONS${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}Run these commands on the production server (15.204.86.6):${NC}"
echo ""
echo "# 1. Pull latest changes"
echo "cd /root/PreMarket_Stratedy"
echo "git pull origin main"
echo ""
echo "# 2. Kill all Node processes and clear cache"
echo "pm2 kill"
echo "pkill -9 -f node || true"
echo "fuser -k 3050/tcp 3051/tcp || true"
echo ""
echo "# 3. Stop Docker containers"
echo "docker-compose -f docker-compose.market-scanner.yml down"
echo "docker rm -f market-scanner market-scanner-ws || true"
echo ""
echo "# 4. Rebuild Docker image (force rebuild)"
echo "docker-compose -f docker-compose.market-scanner.yml build --no-cache"
echo ""
echo "# 5. Start fresh containers"
echo "docker-compose -f docker-compose.market-scanner.yml up -d"
echo ""
echo "# 6. Clear nginx cache"
echo "docker exec thc-nginx rm -rf /var/cache/nginx/* || true"
echo "docker exec thc-nginx nginx -s reload || true"
echo ""
echo "# 7. Verify deployment"
echo "docker ps | grep market-"
echo "curl -s https://daily3club.com | grep -c '/rising\\|/spikes' || echo 'Features removed successfully'"
echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${GREEN}✅ Local changes ready for production${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""
echo "Features removed:"
echo "• Rising Stocks (/rising)"
echo "• Spike Detector (/spikes)"
echo ""
echo "Remaining features:"
echo "• Home page (/)"
echo "• Top Gainers (/gainers)"
echo "• Volume Movers (/volume)"