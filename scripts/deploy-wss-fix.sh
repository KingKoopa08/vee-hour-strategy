#!/bin/bash

# Deploy WebSocket SSL fixes to production
# This script pushes changes and configures nginx for WSS support

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🚀 DEPLOYING WEBSOCKET SSL FIXES${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Server details
SERVER_IP="15.204.86.6"
SERVER_USER="debian"
REPO_PATH="~/vee-hour-strategy"

echo -e "${YELLOW}📦 Step 1: Committing and pushing changes...${NC}"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    git add .gitignore
    git add volume-movers-page.html
    git add scripts/fix-websocket-ssl.sh
    git add scripts/nginx-wss-config.conf
    git add scripts/deploy-wss-fix.sh

    git commit -m "Fix WebSocket SSL for HTTPS connections

- Update volume-movers-page.html to detect HTTPS and use wss://
- Add nginx configuration for /ws proxy path
- Create deployment script for production
- WebSocket now works securely over HTTPS

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

    git push origin main
    echo -e "${GREEN}✅ Changes pushed to GitHub${NC}"
else
    echo -e "${GREEN}✅ No changes to commit${NC}"
fi

echo ""
echo -e "${YELLOW}📥 Step 2: Pulling changes on production server...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
cd ~/vee-hour-strategy
git pull origin main
echo "✅ Code updated"
ENDSSH

echo ""
echo -e "${YELLOW}⚙️ Step 3: Applying nginx configuration...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
cd ~/vee-hour-strategy

# Check if nginx is running
if systemctl is-active --quiet nginx; then
    echo "System nginx detected"

    # Copy the nginx configuration
    sudo cp scripts/nginx-wss-config.conf /etc/nginx/sites-available/daily3club-wss

    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/daily3club-wss /etc/nginx/sites-enabled/daily3club.com

    # Test nginx configuration
    if sudo nginx -t; then
        sudo systemctl reload nginx
        echo "✅ Nginx configuration applied and reloaded"
    else
        echo "❌ Nginx configuration test failed"
        exit 1
    fi
else
    echo "⚠️ System nginx not running - may need manual configuration"
fi
ENDSSH

echo ""
echo -e "${YELLOW}🔄 Step 4: Restarting application...${NC}"

ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
pm2 restart market-scanner
pm2 status market-scanner
echo "✅ Application restarted"
ENDSSH

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📋 DEPLOYMENT COMPLETE!${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}✅ WebSocket SSL fixes deployed to production${NC}"
echo ""
echo -e "${YELLOW}Testing Instructions:${NC}"
echo "1. Open https://daily3club.com/gainers in Chrome"
echo "2. Open DevTools (F12) > Console tab"
echo "3. You should see 'Connected to WebSocket'"
echo "4. Check Network tab - should show wss:// connection"
echo ""
echo -e "${YELLOW}If you still see errors:${NC}"
echo "- Clear browser cache (Ctrl+F5)"
echo "- Check: ssh ${SERVER_USER}@${SERVER_IP} 'pm2 logs market-scanner'"
echo "- Check: ssh ${SERVER_USER}@${SERVER_IP} 'sudo tail -f /var/log/nginx/error.log'"
echo ""
echo -e "${CYAN}URLs to test:${NC}"
echo "- https://daily3club.com/gainers (Top Gainers)"
echo "- https://daily3club.com/volume (Volume Movers)"
echo "- https://daily3club.com/api/gainers (API endpoint)"