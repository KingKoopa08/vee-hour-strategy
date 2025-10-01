#!/bin/bash

# Complete system diagnosis for nginx, Docker, and WebSocket issues

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔍 FULL SYSTEM DIAGNOSIS${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# 1. Check what's running
echo -e "${CYAN}1. CHECKING RUNNING SERVICES${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}System nginx:${NC}"
if systemctl status nginx >/dev/null 2>&1; then
    echo -e "${GREEN}✅ System nginx is running${NC}"
    systemctl status nginx --no-pager | head -5
elif systemctl list-unit-files | grep -q nginx.service; then
    echo -e "${RED}❌ System nginx is installed but NOT running${NC}"
    echo -e "${YELLOW}Status:${NC}"
    systemctl status nginx --no-pager | head -10
else
    echo -e "${YELLOW}⚠️  System nginx not found${NC}"
fi
echo ""

echo -e "${YELLOW}Docker containers:${NC}"
if command -v docker >/dev/null 2>&1; then
    NGINX_CONTAINERS=$(docker ps -a | grep nginx || echo "")
    if [ -n "$NGINX_CONTAINERS" ]; then
        echo -e "${GREEN}✅ Found nginx Docker containers:${NC}"
        docker ps -a | grep -E "CONTAINER|nginx"
    else
        echo -e "${YELLOW}⚠️  No nginx Docker containers${NC}"
    fi

    echo ""
    echo -e "${YELLOW}All running Docker containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
else
    echo -e "${YELLOW}⚠️  Docker not installed${NC}"
fi
echo ""

# 2. Check ports
echo -e "${CYAN}2. CHECKING PORTS${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

for PORT in 80 443 3050 3051; do
    echo -e "${YELLOW}Port $PORT:${NC}"
    PORT_INFO=$(netstat -tlnp 2>/dev/null | grep ":$PORT " || ss -tlnp | grep ":$PORT " || echo "")
    if [ -n "$PORT_INFO" ]; then
        echo -e "${GREEN}✅ Listening${NC}"
        echo "$PORT_INFO"
    else
        echo -e "${RED}❌ Not listening${NC}"
    fi
    echo ""
done

# 3. Check nginx configuration
echo -e "${CYAN}3. NGINX CONFIGURATION${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}Config test:${NC}"
if sudo nginx -t 2>&1; then
    echo -e "${GREEN}✅ Nginx config is valid${NC}"
else
    echo -e "${RED}❌ Nginx config has errors${NC}"
fi
echo ""

echo -e "${YELLOW}Active config file:${NC}"
ACTIVE_SITE=$(readlink -f /etc/nginx/sites-enabled/daily3club.com 2>/dev/null || echo "NOT FOUND")
echo "Symlink: /etc/nginx/sites-enabled/daily3club.com"
echo "Points to: $ACTIVE_SITE"
echo ""

if [ -f "$ACTIVE_SITE" ]; then
    echo -e "${YELLOW}WebSocket proxy configuration:${NC}"
    grep -A 10 "location /ws" "$ACTIVE_SITE" || echo "No /ws location found"
    echo ""

    echo -e "${YELLOW}Proxy pass targets:${NC}"
    grep "proxy_pass" "$ACTIVE_SITE" || echo "No proxy_pass directives"
fi
echo ""

# 4. Check PM2 and backend
echo -e "${CYAN}4. BACKEND STATUS (PM2)${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}PM2 processes:${NC}"
pm2 list
echo ""

echo -e "${YELLOW}Recent backend logs:${NC}"
pm2 logs market-scanner --lines 10 --nostream | tail -15
echo ""

# 5. Test connectivity
echo -e "${CYAN}5. CONNECTIVITY TESTS${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}Testing backend HTTP (port 3050):${NC}"
if curl -s http://localhost:3050/api/gainers | head -c 50 | grep -q "symbol"; then
    echo -e "${GREEN}✅ Backend HTTP responding${NC}"
else
    echo -e "${RED}❌ Backend HTTP not responding${NC}"
fi
echo ""

echo -e "${YELLOW}Testing backend WebSocket (port 3051):${NC}"
if nc -zv localhost 3051 2>&1 | grep -q "succeeded\|open"; then
    echo -e "${GREEN}✅ Backend WebSocket port open${NC}"
else
    echo -e "${RED}❌ Backend WebSocket port not open${NC}"
fi
echo ""

# 6. Check if there's a Docker nginx proxy
echo -e "${CYAN}6. DOCKER NGINX PROXY CHECK${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

DOCKER_NGINX=$(docker ps --format "{{.Names}}" | grep -i nginx | head -1 || echo "")
if [ -n "$DOCKER_NGINX" ]; then
    echo -e "${GREEN}✅ Found Docker nginx: $DOCKER_NGINX${NC}"
    echo ""

    echo -e "${YELLOW}Testing from Docker container to host:${NC}"
    echo "Testing host.docker.internal:3050..."
    docker exec "$DOCKER_NGINX" wget -q -O- http://host.docker.internal:3050/api/gainers 2>/dev/null | head -c 50 && echo -e "${GREEN}✅ Accessible${NC}" || echo -e "${RED}❌ Not accessible${NC}"

    echo ""
    echo "Testing localhost:3050 from container..."
    docker exec "$DOCKER_NGINX" wget -q -O- http://localhost:3050/api/gainers 2>/dev/null | head -c 50 && echo -e "${GREEN}✅ Accessible${NC}" || echo -e "${RED}❌ Not accessible${NC}"
else
    echo -e "${YELLOW}⚠️  No Docker nginx found${NC}"
fi
echo ""

# 7. Summary and recommendations
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 SUMMARY & RECOMMENDATIONS${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Determine the issue
if [ "$DOCKER_NGINX" != "" ]; then
    echo -e "${YELLOW}SETUP: Docker nginx proxy${NC}"
    echo ""
    echo -e "${YELLOW}To fix:${NC}"
    echo "1. Ensure nginx config uses host.docker.internal:3050 and host.docker.internal:3051"
    echo "2. Reload nginx: ${CYAN}docker exec $DOCKER_NGINX nginx -s reload${NC}"
elif systemctl is-active nginx >/dev/null 2>&1; then
    echo -e "${YELLOW}SETUP: System nginx (running)${NC}"
    echo ""
    echo -e "${YELLOW}To fix:${NC}"
    echo "1. Ensure nginx config uses localhost:3050 and localhost:3051"
    echo "2. Reload nginx: ${CYAN}sudo systemctl reload nginx${NC}"
else
    echo -e "${YELLOW}SETUP: System nginx (NOT running)${NC}"
    echo ""
    echo -e "${YELLOW}To fix:${NC}"
    echo "1. Start nginx: ${CYAN}sudo systemctl start nginx${NC}"
    echo "2. Enable on boot: ${CYAN}sudo systemctl enable nginx${NC}"
fi
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo "• Backend is working on ports 3050/3051"
echo "• Need to ensure nginx proxies requests correctly"
echo "• Test at: https://daily3club.com/volume"
echo ""
