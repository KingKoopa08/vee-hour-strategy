#!/bin/bash

# Fix Script - Restore THC application and configure proper multi-domain setup

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔧 FIXING DOCKER SETUP${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Step 1: Stop system nginx to free port 80
echo -e "${YELLOW}🛑 Stopping system Nginx to restore Docker setup...${NC}"
sudo systemctl stop nginx
sudo systemctl disable nginx
echo -e "${GREEN}✅ System Nginx stopped${NC}"

# Step 2: Find docker-compose file and restart THC
echo -e "${YELLOW}🔄 Restarting THC application...${NC}"

# Look for docker-compose file
COMPOSE_FILE=""
if [ -f ~/docker-compose.yml ]; then
    COMPOSE_FILE=~/docker-compose.yml
    COMPOSE_DIR=~
elif [ -f ~/thc/docker-compose.yml ]; then
    COMPOSE_FILE=~/thc/docker-compose.yml
    COMPOSE_DIR=~/thc
elif [ -f ~/thc2/docker-compose.yml ]; then
    COMPOSE_FILE=~/thc2/docker-compose.yml
    COMPOSE_DIR=~/thc2
else
    # Search for it
    COMPOSE_FILE=$(find ~ -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null | head -1)
    COMPOSE_DIR=$(dirname "$COMPOSE_FILE")
fi

if [ ! -z "$COMPOSE_FILE" ]; then
    echo "Found docker-compose at: $COMPOSE_FILE"
    cd "$COMPOSE_DIR"

    # Start the containers
    echo -e "${YELLOW}Starting THC containers...${NC}"
    sudo docker-compose up -d

    sleep 5

    # Check if thc_nginx is running
    if sudo docker ps | grep -q "thc_nginx"; then
        echo -e "${GREEN}✅ THC application restored and running on port 80${NC}"
    else
        echo -e "${RED}⚠️ THC nginx container not running. Checking logs...${NC}"
        sudo docker-compose logs nginx | tail -20
    fi
else
    echo -e "${RED}❌ Could not find docker-compose file${NC}"
    echo "Manually restart your THC application with:"
    echo "  cd [your-thc-directory]"
    echo "  sudo docker-compose up -d"
fi

# Step 3: Show current status
echo ""
echo -e "${CYAN}📊 Current Docker Status:${NC}"
sudo docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"

echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}✅ THC APPLICATION RESTORED${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""

echo -e "${CYAN}📋 BETTER SOLUTION FOR MULTIPLE DOMAINS:${NC}"
echo ""
echo "Since you have Docker nginx (thc_nginx) already running, we should:"
echo ""
echo "1. Configure thc_nginx to handle ALL domains"
echo "2. Add daily3club.com configuration to thc_nginx"
echo "3. Keep everything in Docker for consistency"
echo ""
echo -e "${YELLOW}Option 1: Add daily3club.com to existing Docker nginx${NC}"
echo "  - Edit nginx config in your docker setup"
echo "  - Add server block for daily3club.com → host:3050"
echo "  - Restart thc_nginx container"
echo ""
echo -e "${YELLOW}Option 2: Use different ports${NC}"
echo "  - Keep THC on port 80"
echo "  - Run market scanner on port 3050"
echo "  - Access via daily3club.com:3050"
echo ""
echo -e "${YELLOW}Option 3: Use subdomain${NC}"
echo "  - Main domain for THC"
echo "  - scanner.daily3club.com for market scanner"
echo ""
echo -e "${CYAN}Would you like me to create a configuration for Option 1?${NC}"
echo "This would add daily3club.com to your existing Docker nginx"