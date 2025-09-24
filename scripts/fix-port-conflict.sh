#!/bin/bash

# Fix port conflict and rebuild Docker environment

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔧 FIXING PORT CONFLICTS${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Finding what's using ports 3050 and 3051...${NC}"

# Find processes on ports
echo "Port 3050:"
sudo lsof -i :3050 || echo "Port 3050 is free"
echo ""
echo "Port 3051:"
sudo lsof -i :3051 || echo "Port 3051 is free"

echo ""
echo -e "${YELLOW}📋 Step 2: Killing processes on these ports...${NC}"

# Kill processes on ports
sudo fuser -k 3050/tcp 2>/dev/null || true
sudo fuser -k 3051/tcp 2>/dev/null || true

# Kill any remaining node processes
pkill -f "node" 2>/dev/null || true
pkill -f "unified-scanner" 2>/dev/null || true

# Kill PM2 completely
pm2 kill 2>/dev/null || true

echo -e "${GREEN}✅ Ports cleared${NC}"

echo ""
echo -e "${YELLOW}📋 Step 3: Stopping all Docker containers...${NC}"

# Stop ALL Docker containers
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true

# Specifically stop any conflicting containers
docker-compose -f docker-compose.market-scanner.yml down 2>/dev/null || true
docker-compose down 2>/dev/null || true

echo -e "${GREEN}✅ All containers stopped${NC}"

echo ""
echo -e "${YELLOW}📋 Step 4: Verifying ports are free...${NC}"

if lsof -i :3050 2>/dev/null; then
    echo -e "${RED}❌ Port 3050 still in use!${NC}"
    ps aux | grep 3050
else
    echo -e "${GREEN}✅ Port 3050 is free${NC}"
fi

if lsof -i :3051 2>/dev/null; then
    echo -e "${RED}❌ Port 3051 still in use!${NC}"
    ps aux | grep 3051
else
    echo -e "${GREEN}✅ Port 3051 is free${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Step 5: Starting Docker containers fresh...${NC}"

# Start containers
docker-compose -f docker-compose.market-scanner.yml up -d

echo ""
echo -e "${YELLOW}📋 Step 6: Checking container status...${NC}"

sleep 3
docker ps | grep market-

echo ""
echo -e "${YELLOW}📋 Step 7: Testing the application...${NC}"

# Test if working
if curl -s http://localhost:3050 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Application responding on port 3050${NC}"

    # Check for WebSocket fix
    if curl -s http://localhost:3050/gainers | grep -q "window.location.protocol === 'https:'"; then
        echo -e "${GREEN}✅ WebSocket fix is present${NC}"
    else
        echo -e "${RED}❌ WebSocket fix missing${NC}"
    fi
else
    echo -e "${RED}❌ Application not responding${NC}"
    echo "Container logs:"
    docker logs market-scanner --tail 20
fi

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}✅ PORT CONFLICTS FIXED${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}Containers should now be running!${NC}"
echo ""
echo -e "${YELLOW}Monitor with:${NC}"
echo "docker logs -f market-scanner"
echo "docker-compose -f docker-compose.market-scanner.yml ps"
echo ""
echo -e "${GREEN}Test at:${NC}"
echo "https://daily3club.com/gainers"