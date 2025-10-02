#!/bin/bash

# Show actual nginx configuration

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}Finding nginx configuration files...${NC}"
echo ""

DOCKER_NGINX="market-nginx"

# List all config files
echo -e "${YELLOW}Config files in container:${NC}"
docker exec "$DOCKER_NGINX" ls -la /etc/nginx/sites-available/ 2>/dev/null
echo ""
docker exec "$DOCKER_NGINX" ls -la /etc/nginx/sites-enabled/ 2>/dev/null
echo ""

# Show the daily3club-wss config
echo -e "${YELLOW}Content of /etc/nginx/sites-available/daily3club-wss:${NC}"
docker exec "$DOCKER_NGINX" cat /etc/nginx/sites-available/daily3club-wss 2>/dev/null
echo ""

# Show what's enabled
echo -e "${YELLOW}Symlinks in sites-enabled:${NC}"
docker exec "$DOCKER_NGINX" ls -la /etc/nginx/sites-enabled/ 2>/dev/null
echo ""

# Test nginx config
echo -e "${YELLOW}Testing nginx config:${NC}"
docker exec "$DOCKER_NGINX" nginx -t 2>&1
echo ""
