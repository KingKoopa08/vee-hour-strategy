#!/bin/bash

# Find where WebSocket proxy configuration actually is

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}Searching for WebSocket configuration...${NC}"
echo ""

DOCKER_NGINX="market-nginx"

# Search for "location /ws" in all nginx config files
echo -e "${YELLOW}Searching for 'location /ws' in all nginx configs:${NC}"
docker exec "$DOCKER_NGINX" find /etc/nginx -type f -name "*.conf" -exec grep -l "/ws" {} \; 2>/dev/null
echo ""

# Search for proxy_pass with port 3051
echo -e "${YELLOW}Searching for WebSocket proxy (port 3051):${NC}"
docker exec "$DOCKER_NGINX" find /etc/nginx -type f -name "*.conf" -exec grep -l "3051" {} \; 2>/dev/null
echo ""

# Show main config
echo -e "${YELLOW}Main nginx.conf includes:${NC}"
docker exec "$DOCKER_NGINX" grep -E "include|conf.d" /etc/nginx/nginx.conf 2>/dev/null
echo ""

# List all config files
echo -e "${YELLOW}All config files in /etc/nginx/:${NC}"
docker exec "$DOCKER_NGINX" find /etc/nginx -type f -name "*.conf" 2>/dev/null
echo ""

# Check default.conf
echo -e "${YELLOW}Content of /etc/nginx/conf.d/default.conf:${NC}"
docker exec "$DOCKER_NGINX" cat /etc/nginx/conf.d/default.conf 2>/dev/null
echo ""

# Check if there's a daily3club config
echo -e "${YELLOW}Searching for 'daily3club' configs:${NC}"
docker exec "$DOCKER_NGINX" find /etc/nginx -type f -name "*daily3club*" 2>/dev/null
docker exec "$DOCKER_NGINX" find /etc/nginx -type f -exec grep -l "daily3club.com" {} \; 2>/dev/null
echo ""

# Show actual server blocks
echo -e "${YELLOW}All server blocks listening on port 443:${NC}"
docker exec "$DOCKER_NGINX" grep -r "listen.*443" /etc/nginx/ 2>/dev/null | head -10
echo ""
