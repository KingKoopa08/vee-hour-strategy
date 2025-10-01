#!/bin/bash

# Start nginx and verify WebSocket setup

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 STARTING NGINX${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Start nginx
echo -e "${YELLOW}Starting nginx...${NC}"
sudo systemctl start nginx

# Enable nginx to start on boot
echo -e "${YELLOW}Enabling nginx on boot...${NC}"
sudo systemctl enable nginx

# Check status
echo ""
echo -e "${GREEN}✅ Nginx started${NC}"
echo ""

# Show status
echo -e "${YELLOW}Nginx status:${NC}"
sudo systemctl status nginx --no-pager | head -n 15

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 VERIFYING CONFIGURATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check if PM2 scanner is running
echo -e "${YELLOW}Checking market-scanner status...${NC}"
pm2 list | grep market-scanner

# Check ports
echo ""
echo -e "${YELLOW}Checking if ports are listening...${NC}"
echo -e "Port 3050 (API):"
netstat -tlnp 2>/dev/null | grep :3050 || ss -tlnp | grep :3050 || echo "Not listening"
echo -e "Port 3051 (WebSocket):"
netstat -tlnp 2>/dev/null | grep :3051 || ss -tlnp | grep :3051 || echo "Not listening"
echo -e "Port 80 (HTTP):"
netstat -tlnp 2>/dev/null | grep :80 || ss -tlnp | grep :80 || echo "Not listening"
echo -e "Port 443 (HTTPS):"
netstat -tlnp 2>/dev/null | grep :443 || ss -tlnp | grep :443 || echo "Not listening"

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ SETUP COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${YELLOW}Next: Check if WebSocket clients connect${NC}"
echo -e "  ${CYAN}pm2 logs market-scanner${NC} - Look for '👤 Client connected'"
echo ""
echo -e "${YELLOW}Test the site:${NC}"
echo -e "  ${CYAN}https://daily3club.com/volume${NC}"
echo ""
