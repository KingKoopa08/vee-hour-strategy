#!/bin/bash

# Fix WebSocket SSL issue for HTTPS sites
# Changes WS to WSS connections

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔒 FIXING WEBSOCKET SSL ISSUE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}Problem: Site uses HTTPS but WebSocket uses WS (insecure)${NC}"
echo -e "${YELLOW}Solution: Update to use WSS (secure WebSocket)${NC}"
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Step 1: Check if files are already updated
echo -e "${YELLOW}📝 Checking WebSocket configuration...${NC}"

if grep -q "window.location.protocol === 'https:' ? 'wss:' : 'ws:'" unified-scanner.js && \
   grep -q "window.location.protocol === 'https:' ? 'wss:' : 'ws:'" volume-movers-page.html; then
    echo -e "${GREEN}✅ Client-side WebSocket code already updated${NC}"
else
    echo -e "${YELLOW}⚠️ Client-side code needs updating${NC}"
    echo "Run git pull to get latest code"
fi

# Step 2: Copy Nginx configuration
echo ""
echo -e "${YELLOW}⚙️ Updating Nginx configuration for WSS...${NC}"

if [ -f "$SCRIPT_DIR/nginx-wss-config.conf" ]; then
    echo "Found nginx-wss-config.conf"

    if systemctl is-active --quiet nginx; then
        echo "System Nginx detected"

        # Copy the configuration
        sudo cp "$SCRIPT_DIR/nginx-wss-config.conf" /etc/nginx/sites-available/daily3club-wss

        # Enable the site
        sudo ln -sf /etc/nginx/sites-available/daily3club-wss /etc/nginx/sites-enabled/daily3club.com

        # Test and reload
        if sudo nginx -t; then
            sudo systemctl reload nginx
            echo -e "${GREEN}✅ Nginx updated for WSS support${NC}"
        else
            echo -e "${RED}❌ Nginx configuration test failed${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}Nginx not running as system service${NC}"
        echo "If using Docker nginx, update the container configuration manually"
    fi
else
    echo -e "${RED}❌ nginx-wss-config.conf not found${NC}"
    exit 1
fi

# Step 3: Restart the application
echo ""
echo -e "${YELLOW}🔄 Restarting market-scanner...${NC}"
pm2 restart market-scanner

# Step 4: Test the fix
echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📋 TESTING THE FIX${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}Manual test steps:${NC}"
echo "1. Open Chrome DevTools (F12)"
echo "2. Go to https://daily3club.com/gainers"
echo "3. Check Console tab - should see 'Connected to WebSocket'"
echo "4. Check Network tab - should see WSS connection (not WS)"
echo ""

echo -e "${GREEN}✅ WebSocket should now work over HTTPS!${NC}"
echo ""

echo -e "${CYAN}🔍 How it works:${NC}"
echo "- HTTPS pages connect to WSS (secure WebSocket)"
echo "- Nginx proxies /ws path to localhost:3051"
echo "- Client detects HTTPS and uses WSS automatically"
echo ""

echo -e "${YELLOW}If still having issues:${NC}"
echo "1. Clear browser cache (Ctrl+F5)"
echo "2. Check: pm2 logs market-scanner"
echo "3. Check: sudo tail -f /var/log/nginx/error.log"
echo "4. Ensure SSL certificate is valid: sudo certbot certificates"