#!/bin/bash

# Check Docker network configuration

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}Checking Docker network configuration...${NC}"
echo ""

# List all containers
echo -e "${YELLOW}All Docker containers:${NC}"
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Check if market-scanner container exists
echo -e "${YELLOW}Looking for 'market-scanner' container:${NC}"
if docker ps --format "{{.Names}}" | grep -q "^market-scanner$"; then
    echo -e "${GREEN}✅ Found 'market-scanner' container (running)${NC}"
    docker inspect market-scanner --format '{{.Name}}: {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
elif docker ps -a --format "{{.Names}}" | grep -q "^market-scanner$"; then
    echo -e "${RED}❌ 'market-scanner' container exists but is NOT running${NC}"
else
    echo -e "${RED}❌ No 'market-scanner' container found${NC}"
    echo ""
    echo -e "${YELLOW}This means:${NC}"
    echo "  • Your Node.js app runs via PM2 (not Docker)"
    echo "  • nginx uses Docker service name 'market-scanner:3051'"
    echo "  • But that service doesn't exist!"
    echo ""
    echo -e "${YELLOW}Fix needed:${NC}"
    echo "  Change nginx config to use gateway IP instead of service name"
fi
echo ""

# Check market-nginx network
echo -e "${YELLOW}market-nginx network details:${NC}"
docker inspect market-nginx --format '{{json .NetworkSettings.Networks}}' | jq '.' 2>/dev/null || \
docker inspect market-nginx --format '{{range $key, $value := .NetworkSettings.Networks}}Network: {{$key}}, IP: {{$value.IPAddress}}{{end}}'
echo ""

# Check Docker networks
echo -e "${YELLOW}Docker networks:${NC}"
docker network ls
echo ""

# Test from market-nginx to host
echo -e "${YELLOW}Testing connectivity from market-nginx:${NC}"
GATEWAY_IP=$(docker exec market-nginx ip route | grep default | awk '{print $3}')
echo "Gateway IP: $GATEWAY_IP"
echo ""

echo "Testing market-scanner:3051 (current config):"
if docker exec market-nginx nc -zv market-scanner 3051 2>&1 | grep -q "succeeded\|open"; then
    echo -e "${GREEN}✅ Can reach market-scanner:3051${NC}"
else
    echo -e "${RED}❌ Cannot reach market-scanner:3051${NC}"
    echo "This is why WebSocket isn't working!"
fi
echo ""

echo "Testing $GATEWAY_IP:3051 (gateway IP):"
if docker exec market-nginx nc -zv $GATEWAY_IP 3051 2>&1 | grep -q "succeeded\|open"; then
    echo -e "${GREEN}✅ Can reach $GATEWAY_IP:3051${NC}"
else
    echo -e "${RED}❌ Cannot reach $GATEWAY_IP:3051${NC}"
fi
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}SOLUTION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo "The nginx config uses Docker service name 'market-scanner:3051'"
echo "but your Node.js app runs on the HOST via PM2, not in Docker."
echo ""
echo -e "${YELLOW}Fix:${NC}"
echo "Update nginx config to use gateway IP: ${CYAN}$GATEWAY_IP${NC}"
echo ""
echo "Run this command:"
echo -e "${CYAN}docker exec market-nginx sed -i 's/server market-scanner:3051/server $GATEWAY_IP:3051/' /etc/nginx/conf.d/default.conf${NC}"
echo -e "${CYAN}docker exec market-nginx sed -i 's/server market-scanner:3050/server $GATEWAY_IP:3050/' /etc/nginx/conf.d/default.conf${NC}"
echo -e "${CYAN}docker exec market-nginx nginx -s reload${NC}"
echo ""
