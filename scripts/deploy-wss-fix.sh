#!/bin/bash

# Deploy WebSocket SSL fixes - RUN THIS ON THE PRODUCTION SERVER
# This script pulls changes and configures nginx for WSS support

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

# Check if we're in the right directory
if [ ! -f "unified-scanner.js" ]; then
    echo -e "${RED}❌ Error: Not in the vee-hour-strategy directory${NC}"
    echo "Please cd to ~/vee-hour-strategy first"
    exit 1
fi

echo -e "${YELLOW}📥 Step 1: Pulling latest changes from GitHub...${NC}"
git pull origin main
echo -e "${GREEN}✅ Code updated${NC}"

echo ""
echo -e "${YELLOW}⚙️ Step 2: Applying nginx configuration...${NC}"

# Check if nginx is running
if systemctl is-active --quiet nginx; then
    echo "System nginx detected"

    # Copy the nginx configuration
    if [ -f "scripts/nginx-wss-config.conf" ]; then
        sudo cp scripts/nginx-wss-config.conf /etc/nginx/sites-available/daily3club-wss

        # Enable the site
        sudo ln -sf /etc/nginx/sites-available/daily3club-wss /etc/nginx/sites-enabled/daily3club.com

        # Test nginx configuration
        if sudo nginx -t; then
            sudo systemctl reload nginx
            echo -e "${GREEN}✅ Nginx configuration applied and reloaded${NC}"
        else
            echo -e "${RED}❌ Nginx configuration test failed${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ nginx-wss-config.conf not found${NC}"
        echo "Make sure you pulled the latest changes"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️ System nginx not running${NC}"
    echo "You may need to configure Docker nginx manually"
fi

echo ""
echo -e "${YELLOW}🔄 Step 3: Restarting application...${NC}"
pm2 restart market-scanner
pm2 status market-scanner
echo -e "${GREEN}✅ Application restarted${NC}"

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📋 DEPLOYMENT COMPLETE!${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}✅ WebSocket SSL fixes deployed${NC}"
echo ""
echo -e "${YELLOW}Testing Instructions:${NC}"
echo "1. Open https://daily3club.com/gainers in Chrome"
echo "2. Open DevTools (F12) > Console tab"
echo "3. You should see 'Connected to WebSocket'"
echo "4. Check Network tab - should show wss:// connection"
echo ""
echo -e "${YELLOW}If you still see errors:${NC}"
echo "- Clear browser cache (Ctrl+F5)"
echo "- Check logs: pm2 logs market-scanner"
echo "- Check nginx: sudo tail -f /var/log/nginx/error.log"
echo ""
echo -e "${CYAN}URLs to test:${NC}"
echo "- https://daily3club.com/gainers (Top Gainers)"
echo "- https://daily3club.com/volume (Volume Movers)"
echo "- https://daily3club.com/api/gainers (API endpoint)"