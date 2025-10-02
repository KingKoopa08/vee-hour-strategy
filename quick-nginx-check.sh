#!/bin/bash

# Quick check of nginx WebSocket proxy configuration

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}Checking nginx WebSocket configuration...${NC}"
echo ""

# Check if nginx is running in Docker or as service
DOCKER_NGINX=$(docker ps --format "{{.Names}}" 2>/dev/null | grep -i nginx | head -1 || echo "")

if [ -n "$DOCKER_NGINX" ]; then
    echo -e "${GREEN}✅ Found Docker nginx: $DOCKER_NGINX${NC}"
    echo ""

    # Get gateway IP
    GATEWAY_IP=$(docker exec "$DOCKER_NGINX" ip route | grep default | awk '{print $3}')
    echo -e "Docker gateway IP: ${CYAN}$GATEWAY_IP${NC}"
    echo ""

    # Check nginx config
    echo -e "${YELLOW}Current nginx WebSocket proxy config:${NC}"
    docker exec "$DOCKER_NGINX" grep -A 5 "location /ws" /etc/nginx/sites-available/daily3club-wss 2>/dev/null || \
    docker exec "$DOCKER_NGINX" grep -A 5 "location /ws" /etc/nginx/sites-enabled/* 2>/dev/null
    echo ""

    # Test connectivity from container
    echo -e "${YELLOW}Testing backend connectivity from nginx container:${NC}"
    if docker exec "$DOCKER_NGINX" wget -q -O- http://$GATEWAY_IP:3050/api/gainers 2>/dev/null | head -c 50 | grep -q "symbol"; then
        echo -e "${GREEN}✅ HTTP working: $GATEWAY_IP:3050${NC}"
    else
        echo -e "${RED}❌ Cannot reach $GATEWAY_IP:3050${NC}"
    fi

    if docker exec "$DOCKER_NGINX" nc -zv $GATEWAY_IP 3051 2>&1 | grep -q "succeeded\|open"; then
        echo -e "${GREEN}✅ WebSocket port accessible: $GATEWAY_IP:3051${NC}"
    else
        echo -e "${RED}❌ Cannot reach $GATEWAY_IP:3051${NC}"
    fi
    echo ""

    echo -e "${YELLOW}To fix:${NC}"
    echo "  ${CYAN}./fix-nginx-gateway-ip.sh${NC}"

elif systemctl is-active nginx >/dev/null 2>&1; then
    echo -e "${GREEN}✅ System nginx is running${NC}"
    echo ""

    # Check nginx config
    echo -e "${YELLOW}Current nginx WebSocket proxy config:${NC}"
    grep -A 5 "location /ws" /etc/nginx/sites-enabled/* 2>/dev/null
    echo ""

    echo -e "${YELLOW}Configuration should use:${NC}"
    echo "  proxy_pass http://localhost:3051;"

else
    echo -e "${RED}❌ nginx not found${NC}"
fi
echo ""
