#!/bin/bash

# Fix nginx Docker configuration to use host.docker.internal instead of localhost

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FIXING NGINX DOCKER CONFIGURATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

NGINX_CONFIG="/etc/nginx/sites-available/daily3club-wss"

# Step 1: Check current configuration
echo -e "${YELLOW}📋 Step 1/5: Current nginx configuration:${NC}"
if [ -f "$NGINX_CONFIG" ]; then
    echo -e "${GREEN}✅ Config file found: $NGINX_CONFIG${NC}"
    echo ""
    echo -e "${YELLOW}Current proxy_pass directives:${NC}"
    grep "proxy_pass" "$NGINX_CONFIG" || echo "No proxy_pass found"
else
    echo -e "${RED}❌ Config file not found: $NGINX_CONFIG${NC}"
    exit 1
fi
echo ""

# Step 2: Backup nginx config
echo -e "${YELLOW}📋 Step 2/5: Backing up nginx config...${NC}"
sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d-%H%M%S)"
echo -e "${GREEN}✅ Backup created${NC}"
echo ""

# Step 3: Replace localhost with host.docker.internal
echo -e "${YELLOW}📋 Step 3/5: Updating proxy_pass to use host.docker.internal...${NC}"
sudo sed -i 's|proxy_pass http://localhost:3050|proxy_pass http://host.docker.internal:3050|g' "$NGINX_CONFIG"
sudo sed -i 's|proxy_pass http://localhost:3051|proxy_pass http://host.docker.internal:3051|g' "$NGINX_CONFIG"
echo -e "${GREEN}✅ Configuration updated${NC}"
echo ""

# Step 4: Verify changes
echo -e "${YELLOW}📋 Step 4/5: New configuration:${NC}"
grep "proxy_pass" "$NGINX_CONFIG" || echo "No proxy_pass found"
echo ""

# Step 5: Test and reload nginx
echo -e "${YELLOW}📋 Step 5/5: Testing and reloading nginx...${NC}"
if sudo docker exec nginx nginx -t 2>/dev/null; then
    echo -e "${GREEN}✅ Nginx config test passed${NC}"
    sudo docker exec nginx nginx -s reload
    echo -e "${GREEN}✅ Nginx reloaded${NC}"
else
    echo -e "${RED}❌ Nginx config test failed${NC}"
    echo -e "${YELLOW}Restoring backup...${NC}"
    sudo cp "${NGINX_CONFIG}.backup."* "$NGINX_CONFIG"
    exit 1
fi
echo ""

# Verification
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 VERIFYING CONNECTION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Test connection from nginx container to host
echo -e "${YELLOW}Testing connection from nginx container to host:${NC}"
echo -e "Testing port 3050 (HTTP)..."
if sudo docker exec nginx wget -q -O- http://host.docker.internal:3050/api/gainers 2>/dev/null | head -c 100 | grep -q "symbol"; then
    echo -e "${GREEN}✅ Port 3050 reachable from nginx container${NC}"
else
    echo -e "${RED}❌ Port 3050 NOT reachable from nginx container${NC}"
fi
echo ""

echo -e "Testing port 3051 (WebSocket)..."
if sudo docker exec nginx nc -zv host.docker.internal 3051 2>&1 | grep -q "succeeded\|open"; then
    echo -e "${GREEN}✅ Port 3051 reachable from nginx container${NC}"
else
    echo -e "${RED}❌ Port 3051 NOT reachable from nginx container${NC}"
fi
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ NGINX CONFIGURATION FIXED!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo -e "  2. Open browser console (F12)"
echo -e "  3. Look for: ${GREEN}'Connected to WebSocket'${NC}"
echo -e "  4. Verify data updates every second"
echo ""
echo -e "${YELLOW}If you see a client connection:${NC}"
echo -e "  ${CYAN}pm2 logs market-scanner | grep 'Client connected'${NC}"
echo ""
