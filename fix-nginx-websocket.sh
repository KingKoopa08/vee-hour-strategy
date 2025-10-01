#!/bin/bash

# ============================================
# FIX NGINX WEBSOCKET PROXY
# Run this on production server to enable WebSocket connections
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FIXING NGINX WEBSOCKET CONFIGURATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Step 1: Backup current nginx config
echo -e "${YELLOW}📋 Step 1/4: Backing up current nginx config...${NC}"
if [ -f "/etc/nginx/sites-available/daily3club.com" ]; then
    sudo cp /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-available/daily3club.com.backup.$(date +%Y%m%d-%H%M%S)
    echo -e "${GREEN}✅ Backup created${NC}"
else
    echo -e "${YELLOW}⚠️  Config file not found at /etc/nginx/sites-available/daily3club.com${NC}"
    echo -e "${YELLOW}   Looking for nginx config...${NC}"
    sudo nginx -T 2>/dev/null | grep "server_name daily3club.com" -A 5 || echo "No config found"
    exit 1
fi
echo ""

# Step 2: Copy new config
echo -e "${YELLOW}📋 Step 2/4: Copying new nginx config...${NC}"
sudo cp nginx.conf /etc/nginx/sites-available/daily3club.com
echo -e "${GREEN}✅ Config copied${NC}"
echo ""

# Step 3: Test nginx config
echo -e "${YELLOW}📋 Step 3/4: Testing nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✅ Nginx config is valid${NC}"
else
    echo -e "${RED}❌ Nginx config test failed${NC}"
    echo -e "${YELLOW}Restoring backup...${NC}"
    sudo cp /etc/nginx/sites-available/daily3club.com.backup.* /etc/nginx/sites-available/daily3club.com
    exit 1
fi
echo ""

# Step 4: Reload nginx
echo -e "${YELLOW}📋 Step 4/4: Reloading nginx...${NC}"
sudo systemctl reload nginx
echo -e "${GREEN}✅ Nginx reloaded${NC}"
echo ""

# Step 5: Verify WebSocket is working
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 VERIFYING WEBSOCKET${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

echo -e "${YELLOW}Checking nginx status...${NC}"
sudo systemctl status nginx --no-pager | head -n 10
echo ""

echo -e "${YELLOW}Checking port 3051 is listening...${NC}"
if netstat -tlnp 2>/dev/null | grep :3051 || ss -tlnp | grep :3051; then
    echo -e "${GREEN}✅ Port 3051 is listening${NC}"
else
    echo -e "${RED}❌ Port 3051 is not listening${NC}"
    echo -e "${YELLOW}Check if market-scanner is running:${NC}"
    pm2 list
    exit 1
fi
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ NGINX WEBSOCKET FIX COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}WebSocket should now work at:${NC}"
echo -e "  ${CYAN}wss://daily3club.com/ws${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo -e "  2. Open browser console (F12)"
echo -e "  3. Look for: ${GREEN}'Connected to WebSocket'${NC}"
echo -e "  4. Verify data updates every second"
echo ""
echo -e "${YELLOW}If still not working, check:${NC}"
echo -e "  ${CYAN}pm2 logs market-scanner${NC}       - Should see '👤 Client connected'"
echo -e "  ${CYAN}sudo tail -f /var/log/nginx/error.log${NC}  - Check for errors"
echo ""
