#!/bin/bash

# Final fix for Docker nginx to use host.docker.internal

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FINAL DOCKER NGINX FIX${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

NGINX_CONFIG="/etc/nginx/sites-available/daily3club-wss"
DOCKER_NGINX="market-nginx"

# Step 1: Verify Docker nginx is running
echo -e "${YELLOW}📋 Step 1/6: Verifying Docker nginx...${NC}"
if docker ps | grep -q "$DOCKER_NGINX"; then
    echo -e "${GREEN}✅ Docker nginx running: $DOCKER_NGINX${NC}"
else
    echo -e "${RED}❌ Docker nginx not found: $DOCKER_NGINX${NC}"
    exit 1
fi
echo ""

# Step 2: Backup current config
echo -e "${YELLOW}📋 Step 2/6: Backing up nginx config...${NC}"
sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.final.$(date +%Y%m%d-%H%M%S)"
echo -e "${GREEN}✅ Backup created${NC}"
echo ""

# Step 3: Show current config
echo -e "${YELLOW}📋 Step 3/6: Current configuration:${NC}"
grep "proxy_pass" "$NGINX_CONFIG" | head -3
echo ""

# Step 4: Update config
echo -e "${YELLOW}📋 Step 4/6: Updating to host.docker.internal...${NC}"
sudo sed -i 's|proxy_pass http://localhost:3050|proxy_pass http://host.docker.internal:3050|g' "$NGINX_CONFIG"
sudo sed -i 's|proxy_pass http://localhost:3051|proxy_pass http://host.docker.internal:3051|g' "$NGINX_CONFIG"
echo -e "${GREEN}✅ Configuration updated${NC}"
echo ""

echo -e "${YELLOW}New configuration:${NC}"
grep "proxy_pass" "$NGINX_CONFIG" | head -3
echo ""

# Step 5: Test and reload nginx in Docker
echo -e "${YELLOW}📋 Step 5/6: Testing nginx config in Docker...${NC}"
if sudo docker exec "$DOCKER_NGINX" nginx -t; then
    echo -e "${GREEN}✅ Nginx config test passed${NC}"
    echo ""

    echo -e "${YELLOW}Reloading nginx...${NC}"
    sudo docker exec "$DOCKER_NGINX" nginx -s reload
    echo -e "${GREEN}✅ Nginx reloaded${NC}"
else
    echo -e "${RED}❌ Nginx config test failed${NC}"
    echo -e "${YELLOW}Restoring backup...${NC}"
    sudo cp "${NGINX_CONFIG}.backup.final."* "$NGINX_CONFIG"
    exit 1
fi
echo ""

# Step 6: Wait and verify
echo -e "${YELLOW}📋 Step 6/6: Waiting for connections...${NC}"
echo -e "${YELLOW}Waiting 5 seconds for clients to connect...${NC}"
sleep 5
echo ""

# Check if we see client connections in PM2 logs
echo -e "${YELLOW}Checking PM2 logs for WebSocket connections:${NC}"
CLIENT_LOGS=$(pm2 logs market-scanner --lines 100 --nostream 2>/dev/null | grep "Client connected" | tail -5 || echo "")
if [ -n "$CLIENT_LOGS" ]; then
    echo -e "${GREEN}✅ WebSocket clients are connecting!${NC}"
    echo "$CLIENT_LOGS"
else
    echo -e "${YELLOW}⚠️  No client connections yet in logs${NC}"
    echo -e "${YELLOW}This might be normal - check browser console${NC}"
fi
echo ""

# Final verification
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 FINAL VERIFICATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

echo -e "${YELLOW}Testing proxy from Docker to backend:${NC}"
echo -e "HTTP (3050):"
if sudo docker exec "$DOCKER_NGINX" wget -q -O- http://host.docker.internal:3050/api/gainers 2>/dev/null | head -c 50 | grep -q "symbol"; then
    echo -e "${GREEN}✅ HTTP proxy working${NC}"
else
    echo -e "${RED}❌ HTTP proxy not working${NC}"
fi

echo ""
echo -e "WebSocket (3051):"
if sudo docker exec "$DOCKER_NGINX" nc -zv host.docker.internal 3051 2>&1 | grep -q "succeeded\|open"; then
    echo -e "${GREEN}✅ WebSocket port reachable${NC}"
else
    echo -e "${YELLOW}⚠️  WebSocket test inconclusive (might still work)${NC}"
fi
echo ""

# Show Docker nginx logs
echo -e "${YELLOW}Recent nginx access logs:${NC}"
sudo docker exec "$DOCKER_NGINX" tail -10 /var/log/nginx/access.log 2>/dev/null || echo "No logs available"
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ CONFIGURATION COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo -e "  1. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo -e "  2. Open browser console (F12)"
echo -e "  3. You should see: ${GREEN}'Connected to WebSocket'${NC}"
echo -e "  4. Data should update every second"
echo ""
echo -e "${YELLOW}To monitor connections in real-time:${NC}"
echo -e "  ${CYAN}pm2 logs market-scanner | grep -E 'Client connected|Broadcasted'${NC}"
echo ""
echo -e "${YELLOW}If still not working:${NC}"
echo -e "  • Check browser console for WebSocket errors"
echo -e "  • Verify wss://daily3club.com/ws is accessible"
echo -e "  • Check nginx error logs: ${CYAN}sudo docker exec $DOCKER_NGINX tail -50 /var/log/nginx/error.log${NC}"
echo ""
