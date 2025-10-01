#!/bin/bash

# Check Docker nginx configuration for WebSocket support

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔍 CHECKING DOCKER NGINX CONFIG${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Find active config
echo -e "${YELLOW}Active nginx configuration:${NC}"
SYMLINK=$(readlink -f /etc/nginx/sites-enabled/daily3club.com)
echo "Symlink: /etc/nginx/sites-enabled/daily3club.com -> $SYMLINK"
echo ""

# Show the config
echo -e "${YELLOW}Current configuration file:${NC}"
echo -e "${CYAN}$SYMLINK${NC}"
echo ""

# Check for WebSocket location
echo -e "${YELLOW}WebSocket configuration:${NC}"
if grep -q "location /ws" "$SYMLINK"; then
    echo -e "${GREEN}✅ WebSocket location /ws found${NC}"
    echo ""
    grep -A 15 "location /ws" "$SYMLINK"
else
    echo -e "${RED}❌ No WebSocket location found${NC}"
fi
echo ""

# Check upstream configuration
echo -e "${YELLOW}Upstream configuration:${NC}"
if grep -q "upstream" "$SYMLINK"; then
    grep -B 2 -A 2 "upstream" "$SYMLINK"
else
    echo "No upstream blocks defined"
fi
echo ""

# Check proxy_pass values
echo -e "${YELLOW}Proxy pass configuration:${NC}"
grep "proxy_pass" "$SYMLINK" || echo "No proxy_pass directives found"
echo ""

# Check Docker
echo -e "${YELLOW}Docker nginx container:${NC}"
sudo docker ps | grep nginx || echo "No nginx container found"
echo ""

# Check port 3051
echo -e "${YELLOW}Port 3051 status (WebSocket):${NC}"
netstat -tlnp 2>/dev/null | grep :3051 || ss -tlnp | grep :3051 || echo "Not listening"
echo ""

# Check PM2
echo -e "${YELLOW}PM2 market-scanner status:${NC}"
pm2 list | grep market-scanner || echo "Not running"
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📝 SUMMARY${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "Active config: ${CYAN}$SYMLINK${NC}"
echo ""
echo -e "${YELLOW}To fix WebSocket:${NC}"
echo "1. Edit: ${CYAN}sudo nano $SYMLINK${NC}"
echo "2. Find the 'location /ws' block"
echo "3. Make sure proxy_pass points to: ${GREEN}http://host.docker.internal:3051${NC}"
echo "4. Or if using upstream: ${GREEN}http://websocket${NC} (upstream must point to host.docker.internal:3051)"
echo "5. Reload: ${CYAN}sudo docker exec nginx nginx -s reload${NC}"
echo ""
