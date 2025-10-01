#!/bin/bash

# Diagnose nginx startup issues

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔍 DIAGNOSING NGINX ISSUES${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check nginx config test
echo -e "${YELLOW}Testing nginx configuration...${NC}"
sudo nginx -t
echo ""

# Check nginx status and errors
echo -e "${YELLOW}Checking nginx service status...${NC}"
sudo systemctl status nginx.service --no-pager -l
echo ""

# Check recent journal logs
echo -e "${YELLOW}Recent nginx error logs:${NC}"
sudo journalctl -xeu nginx.service --no-pager -n 30
echo ""

# Check nginx error log file
echo -e "${YELLOW}Nginx error log file:${NC}"
sudo tail -30 /var/log/nginx/error.log 2>/dev/null || echo "No error log file"
echo ""

# Check what's listening on port 80 and 443
echo -e "${YELLOW}Checking what's using port 80 and 443...${NC}"
echo "Port 80:"
sudo netstat -tlnp | grep :80 || sudo ss -tlnp | grep :80 || echo "Nothing listening on port 80"
echo "Port 443:"
sudo netstat -tlnp | grep :443 || sudo ss -tlnp | grep :443 || echo "Nothing listening on port 443"
echo ""

# Check nginx config file
echo -e "${YELLOW}Current nginx config:${NC}"
echo "Sites available:"
ls -la /etc/nginx/sites-available/ 2>/dev/null || echo "Directory not found"
echo ""
echo "Sites enabled:"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo "Directory not found"
echo ""

# Check the actual config being used
echo -e "${YELLOW}Checking nginx config location:${NC}"
sudo nginx -T 2>&1 | head -50
echo ""
