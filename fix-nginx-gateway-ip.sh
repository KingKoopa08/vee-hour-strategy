#!/bin/bash

# Fix nginx Docker to use gateway IP to reach host

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FIXING NGINX WITH GATEWAY IP${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

NGINX_CONFIG="/etc/nginx/sites-available/daily3club-wss"
DOCKER_NGINX="market-nginx"

# Step 1: Get the gateway IP from inside the container
echo -e "${YELLOW}📋 Step 1/7: Finding Docker gateway IP...${NC}"
GATEWAY_IP=$(sudo docker exec "$DOCKER_NGINX" ip route | grep default | awk '{print $3}')
if [ -z "$GATEWAY_IP" ]; then
    echo -e "${RED}❌ Could not find gateway IP${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Gateway IP: $GATEWAY_IP${NC}"
echo ""

# Step 2: Test if we can reach the host from container
echo -e "${YELLOW}📋 Step 2/7: Testing connectivity from container to host...${NC}"
if sudo docker exec "$DOCKER_NGINX" wget -q -O- http://$GATEWAY_IP:3050/api/gainers 2>/dev/null | head -c 50 | grep -q "symbol"; then
    echo -e "${GREEN}✅ Host is reachable at $GATEWAY_IP:3050${NC}"
else
    echo -e "${RED}❌ Cannot reach host at $GATEWAY_IP:3050${NC}"
    echo -e "${YELLOW}Trying alternative IPs...${NC}"

    # Try docker0 IP
    DOCKER0_IP=$(ip route | grep docker0 | awk '{print $9}')
    if [ -n "$DOCKER0_IP" ]; then
        echo -e "${YELLOW}Testing docker0 IP: $DOCKER0_IP${NC}"
        if sudo docker exec "$DOCKER_NGINX" wget -q -O- http://$DOCKER0_IP:3050/api/gainers 2>/dev/null | head -c 50 | grep -q "symbol"; then
            echo -e "${GREEN}✅ Host reachable at $DOCKER0_IP${NC}"
            GATEWAY_IP=$DOCKER0_IP
        fi
    fi
fi
echo ""

# Step 3: Backup config
echo -e "${YELLOW}📋 Step 3/7: Backing up nginx config...${NC}"
sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.gateway.$(date +%Y%m%d-%H%M%S)"
echo -e "${GREEN}✅ Backup created${NC}"
echo ""

# Step 4: Show current config
echo -e "${YELLOW}📋 Step 4/7: Current configuration:${NC}"
grep "proxy_pass" "$NGINX_CONFIG" | head -3
echo ""

# Step 5: Update config
echo -e "${YELLOW}📋 Step 5/7: Updating to gateway IP $GATEWAY_IP...${NC}"
# Replace host.docker.internal with gateway IP
sudo sed -i "s|http://host.docker.internal:3050|http://$GATEWAY_IP:3050|g" "$NGINX_CONFIG"
sudo sed -i "s|http://host.docker.internal:3051|http://$GATEWAY_IP:3051|g" "$NGINX_CONFIG"
# Also replace localhost if it exists
sudo sed -i "s|http://localhost:3050|http://$GATEWAY_IP:3050|g" "$NGINX_CONFIG"
sudo sed -i "s|http://localhost:3051|http://$GATEWAY_IP:3051|g" "$NGINX_CONFIG"
echo -e "${GREEN}✅ Configuration updated${NC}"
echo ""

echo -e "${YELLOW}New configuration:${NC}"
grep "proxy_pass" "$NGINX_CONFIG" | head -3
echo ""

# Step 6: Test and reload nginx
echo -e "${YELLOW}📋 Step 6/7: Testing and reloading nginx...${NC}"
if sudo docker exec "$DOCKER_NGINX" nginx -t 2>&1 | grep -q "successful"; then
    echo -e "${GREEN}✅ Nginx config test passed${NC}"
    sudo docker exec "$DOCKER_NGINX" nginx -s reload 2>&1 | head -3
    echo -e "${GREEN}✅ Nginx reloaded${NC}"
else
    echo -e "${RED}❌ Nginx config test failed${NC}"
    sudo cp "${NGINX_CONFIG}.backup.gateway."* "$NGINX_CONFIG"
    exit 1
fi
echo ""

# Step 7: Final verification
echo -e "${YELLOW}📋 Step 7/7: Final verification...${NC}"
sleep 3
echo ""

echo -e "${YELLOW}Testing HTTP proxy:${NC}"
if sudo docker exec "$DOCKER_NGINX" wget -q -O- http://$GATEWAY_IP:3050/api/gainers 2>/dev/null | head -c 50 | grep -q "symbol"; then
    echo -e "${GREEN}✅ HTTP proxy working through $GATEWAY_IP:3050${NC}"
else
    echo -e "${RED}❌ HTTP proxy not working${NC}"
fi
echo ""

echo -e "${YELLOW}Testing WebSocket port:${NC}"
if sudo docker exec "$DOCKER_NGINX" nc -zv $GATEWAY_IP 3051 2>&1 | grep -q "succeeded\|open"; then
    echo -e "${GREEN}✅ WebSocket port accessible at $GATEWAY_IP:3051${NC}"
else
    echo -e "${YELLOW}⚠️  nc test inconclusive (port might still work)${NC}"
fi
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ NGINX CONFIGURED WITH GATEWAY IP${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Configuration:${NC}"
echo -e "  Gateway IP: ${CYAN}$GATEWAY_IP${NC}"
echo -e "  HTTP: ${CYAN}$GATEWAY_IP:3050${NC}"
echo -e "  WebSocket: ${CYAN}$GATEWAY_IP:3051${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo -e "  2. Open browser console (F12)"
echo -e "  3. Look for: ${GREEN}'Connected to WebSocket'${NC}"
echo -e "  4. Data should update every second!"
echo ""
echo -e "${YELLOW}Monitor for connections:${NC}"
echo -e "  ${CYAN}pm2 logs market-scanner --lines 50 | grep 'Client connected'${NC}"
echo ""
echo -e "${YELLOW}If you see client connections, IT'S WORKING! 🎉${NC}"
echo ""
