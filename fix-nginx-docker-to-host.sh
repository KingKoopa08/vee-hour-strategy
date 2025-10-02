#!/bin/bash

# Fix nginx to connect to host PM2 instead of Docker service

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
echo -e "${YELLOW}Step 1/6: Getting Docker gateway IP...${NC}"
GATEWAY_IP=$(docker exec "$DOCKER_NGINX" ip route | grep default | awk '{print $3}')
echo -e "${GREEN}✅ Gateway IP: $GATEWAY_IP${NC}"
echo ""

# Backup config
echo -e "${YELLOW}Step 2/6: Backing up nginx config...${NC}"
docker exec "$DOCKER_NGINX" cp "$CONFIG_FILE" "${CONFIG_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
echo -e "${GREEN}✅ Backup created${NC}"
echo ""

# Show current config
echo -e "${YELLOW}Step 3/6: Current upstream configuration:${NC}"
docker exec "$DOCKER_NGINX" grep -A 1 "upstream" "$CONFIG_FILE"
echo ""

# Update config
echo -e "${YELLOW}Step 4/6: Updating to gateway IP...${NC}"
docker exec "$DOCKER_NGINX" sed -i "s/server market-scanner:3050/server $GATEWAY_IP:3050/" "$CONFIG_FILE"
docker exec "$DOCKER_NGINX" sed -i "s/server market-scanner:3051/server $GATEWAY_IP:3051/" "$CONFIG_FILE"
echo -e "${GREEN}✅ Configuration updated${NC}"
echo ""

echo -e "${YELLOW}New upstream configuration:${NC}"
docker exec "$DOCKER_NGINX" grep -A 1 "upstream" "$CONFIG_FILE"
echo ""

# Test config
echo -e "${YELLOW}Step 5/6: Testing nginx configuration...${NC}"
if docker exec "$DOCKER_NGINX" nginx -t 2>&1 | grep -q "successful"; then
    echo -e "${GREEN}✅ Nginx config test passed${NC}"
else
    echo -e "${RED}❌ Nginx config test failed${NC}"
    echo "Restoring backup..."
    docker exec "$DOCKER_NGINX" cp "${CONFIG_FILE}.backup."* "$CONFIG_FILE"
    exit 1
fi
echo ""

# Reload nginx
echo -e "${YELLOW}Step 6/6: Reloading nginx...${NC}"
docker exec "$DOCKER_NGINX" nginx -s reload
echo -e "${GREEN}✅ Nginx reloaded${NC}"
echo ""

# Verify connectivity
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 VERIFICATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

echo -e "${YELLOW}Testing HTTP backend (port 3050):${NC}"
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
echo -e "${YELLOW}Waiting 5 seconds for WebSocket connections...${NC}"
sleep 5
echo ""

CLIENT_COUNT=$(pm2 logs market-scanner --lines 50 --nostream 2>/dev/null | grep -c "Client connected" || echo "0")
if [ "$CLIENT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ WebSocket clients connecting!${NC}"
    pm2 logs market-scanner --lines 50 --nostream | grep "Client connected" | tail -3
else
    echo -e "${YELLOW}⚠️  No client connections yet${NC}"
    echo "Wait a moment and check browser console"
fi
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ FIX COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  Old: ${RED}market-scanner:3050/3051${NC} (Docker service - didn't exist)"
echo "  New: ${GREEN}$GATEWAY_IP:3050/3051${NC} (Host via gateway IP)"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo "  2. Open browser console (F12)"
echo "  3. Look for: ${GREEN}'Connected to WebSocket'${NC}"
echo "  4. Data should update in real-time now!"
echo ""
echo -e "${YELLOW}Monitor connections:${NC}"
echo "  ${CYAN}pm2 logs market-scanner | grep -E 'Client connected|Broadcasted'${NC}"
echo ""
