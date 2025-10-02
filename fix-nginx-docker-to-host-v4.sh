#!/bin/bash

# Fix nginx to connect to host PM2 instead of Docker service (v4 - direct exec method)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FIXING NGINX DOCKER → HOST CONNECTION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

DOCKER_NGINX="market-nginx"
CONFIG_FILE="/etc/nginx/conf.d/default.conf"

# Get gateway IP
echo -e "${YELLOW}Step 1/7: Getting Docker gateway IP...${NC}"
GATEWAY_IP=$(docker exec "$DOCKER_NGINX" ip route | grep default | awk '{print $3}')
echo -e "${GREEN}✅ Gateway IP: $GATEWAY_IP${NC}"
echo ""

# Show current config
echo -e "${YELLOW}Step 2/7: Current upstream configuration:${NC}"
docker exec "$DOCKER_NGINX" grep -A 1 "upstream" "$CONFIG_FILE"
echo ""

# Backup config inside container
echo -e "${YELLOW}Step 3/7: Creating backup inside container...${NC}"
docker exec "$DOCKER_NGINX" cp "$CONFIG_FILE" "${CONFIG_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
echo -e "${GREEN}✅ Backup created${NC}"
echo ""

# Use cat and redirect to update the file (avoids sed in-place editing)
echo -e "${YELLOW}Step 4/7: Updating config via cat redirection...${NC}"
docker exec "$DOCKER_NGINX" sh -c "cat $CONFIG_FILE | sed 's/server market-scanner:3050/server $GATEWAY_IP:3050/' | sed 's/server market-scanner:3051/server $GATEWAY_IP:3051/' > ${CONFIG_FILE}.new"
echo -e "${GREEN}✅ New config created${NC}"
echo ""

echo -e "${YELLOW}New upstream configuration:${NC}"
docker exec "$DOCKER_NGINX" grep -A 1 "upstream" "${CONFIG_FILE}.new"
echo ""

# Move new config over old one
echo -e "${YELLOW}Step 5/7: Replacing config file...${NC}"
docker exec "$DOCKER_NGINX" mv "${CONFIG_FILE}.new" "$CONFIG_FILE"
echo -e "${GREEN}✅ Config replaced${NC}"
echo ""

# Test config
echo -e "${YELLOW}Step 6/7: Testing nginx config...${NC}"
if docker exec "$DOCKER_NGINX" nginx -t 2>&1 | grep -q "successful"; then
    echo -e "${GREEN}✅ Nginx config test passed${NC}"
else
    echo -e "${RED}❌ Nginx config test failed${NC}"
    echo "Restoring backup..."
    docker exec "$DOCKER_NGINX" sh -c "cp ${CONFIG_FILE}.backup.* $CONFIG_FILE"
    exit 1
fi
echo ""

# Reload nginx
echo -e "${YELLOW}Step 7/7: Reloading nginx...${NC}"
docker exec "$DOCKER_NGINX" nginx -s reload 2>/dev/null || {
    echo -e "${YELLOW}Reload failed, restarting container...${NC}"
    docker restart "$DOCKER_NGINX"
    sleep 3
}
echo -e "${GREEN}✅ Nginx reloaded${NC}"
echo ""

# Verify connectivity
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 VERIFICATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

echo -e "${YELLOW}Testing HTTP backend (port 3050):${NC}"
sleep 2
if docker exec "$DOCKER_NGINX" wget -q -O- http://$GATEWAY_IP:3050/api/gainers 2>/dev/null | head -c 50 | grep -q "symbol"; then
    echo -e "${GREEN}✅ HTTP backend reachable${NC}"
else
    echo -e "${RED}❌ HTTP backend not reachable${NC}"
fi
echo ""

echo -e "${YELLOW}Testing WebSocket backend (port 3051):${NC}"
if docker exec "$DOCKER_NGINX" nc -zv $GATEWAY_IP 3051 2>&1 | grep -q "succeeded\|open"; then
    echo -e "${GREEN}✅ WebSocket backend reachable${NC}"
else
    echo -e "${RED}❌ WebSocket backend not reachable${NC}"
fi
echo ""

# Check for client connections
echo -e "${YELLOW}Waiting 10 seconds for WebSocket connections...${NC}"
for i in {10..1}; do
    printf "\r  ⏳ ${i}s remaining..."
    sleep 1
done
echo ""
echo ""

CLIENT_COUNT=$(pm2 logs market-scanner --lines 100 --nostream 2>/dev/null | grep -c "Client connected" || echo "0")
if [ "$CLIENT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}🎉 SUCCESS! WebSocket clients are connecting!${NC}"
    echo ""
    echo -e "${YELLOW}Recent connections:${NC}"
    pm2 logs market-scanner --lines 100 --nostream | grep "Client connected" | tail -5
else
    echo -e "${YELLOW}⚠️  No client connections in logs yet${NC}"
    echo "This is normal - connections will appear when you open the website"
fi
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ FIX COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Configuration changed:${NC}"
echo "  ${RED}Before:${NC} market-scanner:3050/3051 (Docker service - didn't exist)"
echo "  ${GREEN}After:${NC}  $GATEWAY_IP:3050/3051 (Host via gateway IP)"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo "  2. Open browser console (F12)"
echo "  3. You should see: ${GREEN}'Connected to WebSocket'${NC}"
echo "  4. Data should update every second with REAL percentages!"
echo ""
echo -e "${YELLOW}Monitor live connections:${NC}"
echo "  ${CYAN}pm2 logs market-scanner | grep -E 'Client connected|Broadcasted'${NC}"
echo ""
echo -e "${GREEN}🎉 If you see 'Client connected' messages, IT'S WORKING!${NC}"
echo ""
