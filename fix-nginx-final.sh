#!/bin/bash

# Fix nginx to use gateway IP - handles both localhost and market-scanner

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FIXING NGINX → GATEWAY IP${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

DOCKER_NGINX="market-nginx"
CONFIG_FILE="/etc/nginx/conf.d/default.conf"

# Get gateway IP
echo -e "${YELLOW}Step 1/6: Getting Docker gateway IP...${NC}"
GATEWAY_IP=$(docker exec "$DOCKER_NGINX" ip route | grep default | awk '{print $3}')
echo -e "${GREEN}✅ Gateway IP: $GATEWAY_IP${NC}"
echo ""

# Show current config
echo -e "${YELLOW}Step 2/6: Current upstream configuration:${NC}"
docker exec "$DOCKER_NGINX" grep -A 1 "upstream" "$CONFIG_FILE"
echo ""

# Backup
echo -e "${YELLOW}Step 3/6: Creating backup...${NC}"
docker exec "$DOCKER_NGINX" cp "$CONFIG_FILE" "${CONFIG_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
echo -e "${GREEN}✅ Backup created${NC}"
echo ""

# Update using multiple sed patterns to catch all cases
echo -e "${YELLOW}Step 4/6: Updating config...${NC}"
docker exec "$DOCKER_NGINX" sh -c "sed -e 's/server market-scanner:3050/server $GATEWAY_IP:3050/' \
    -e 's/server market-scanner:3051/server $GATEWAY_IP:3051/' \
    -e 's/server localhost:3050/server $GATEWAY_IP:3050/' \
    -e 's/server localhost:3051/server $GATEWAY_IP:3051/' \
    $CONFIG_FILE > /tmp/default.conf.new && cat /tmp/default.conf.new > $CONFIG_FILE"
echo -e "${GREEN}✅ Config updated${NC}"
echo ""

echo -e "${YELLOW}New upstream configuration:${NC}"
docker exec "$DOCKER_NGINX" grep -A 1 "upstream" "$CONFIG_FILE"
echo ""

# Test and reload
echo -e "${YELLOW}Step 5/6: Testing and reloading nginx...${NC}"
if docker exec "$DOCKER_NGINX" nginx -t 2>&1 | grep -q "successful"; then
    echo -e "${GREEN}✅ Config test passed${NC}"
    docker exec "$DOCKER_NGINX" nginx -s reload 2>/dev/null || docker restart "$DOCKER_NGINX"
    sleep 3
    echo -e "${GREEN}✅ Nginx reloaded${NC}"
else
    echo -e "${RED}❌ Config test failed${NC}"
    exit 1
fi
echo ""

# Verify
echo -e "${YELLOW}Step 6/6: Verifying connectivity...${NC}"
echo ""

if docker exec "$DOCKER_NGINX" wget -q -O- http://$GATEWAY_IP:3050/api/gainers 2>/dev/null | head -c 50 | grep -q "symbol"; then
    echo -e "${GREEN}✅ HTTP backend working${NC}"
else
    echo -e "${RED}❌ HTTP backend not working${NC}"
fi

if docker exec "$DOCKER_NGINX" nc -zv $GATEWAY_IP 3051 2>&1 | grep -q "succeeded\|open"; then
    echo -e "${GREEN}✅ WebSocket backend reachable${NC}"
else
    echo -e "${RED}❌ WebSocket backend not reachable${NC}"
fi
echo ""

# Wait for connections
echo -e "${YELLOW}Waiting 10 seconds for WebSocket connections...${NC}"
for i in {10..1}; do
    printf "\r  ⏳ ${i}s remaining..."
    sleep 1
done
echo ""
echo ""

CLIENT_COUNT=$(pm2 logs market-scanner --lines 100 --nostream 2>/dev/null | grep -c "Client connected" || echo "0")
if [ "$CLIENT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}🎉 SUCCESS! WebSocket clients connecting!${NC}"
    echo ""
    pm2 logs market-scanner --lines 100 --nostream | grep "Client connected" | tail -5
else
    echo -e "${YELLOW}⚠️  No connections yet - open https://daily3club.com/volume${NC}"
fi
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ CONFIGURATION COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Backend → nginx connection fixed:${NC}"
echo "  Using: ${GREEN}$GATEWAY_IP:3050/3051${NC}"
echo ""
echo -e "${GREEN}Test now:${NC}"
echo "  1. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo "  2. Console (F12): Look for ${GREEN}'Connected to WebSocket'${NC}"
echo "  3. Data should update every second!"
echo ""
echo -e "${YELLOW}Monitor:${NC} ${CYAN}pm2 logs market-scanner | grep 'Client connected'${NC}"
echo ""
