#!/bin/bash

# Diagnose and fix Nginx startup issues

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔍 DIAGNOSING NGINX ISSUES${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Step 1: Check what's blocking port 80
echo -e "${YELLOW}📊 Checking what's using port 80...${NC}"
if sudo lsof -i :80 2>/dev/null | grep LISTEN; then
    echo -e "${RED}⚠️ Port 80 is already in use!${NC}"
    echo ""
    echo "Attempting to identify and stop the conflicting service..."

    # Check if it's Apache
    if systemctl is-active --quiet apache2; then
        echo "Found Apache running. Stopping it..."
        sudo systemctl stop apache2
        sudo systemctl disable apache2
        echo -e "${GREEN}✅ Apache stopped and disabled${NC}"
    fi

    # Check if it's another web server
    if systemctl is-active --quiet httpd; then
        echo "Found httpd running. Stopping it..."
        sudo systemctl stop httpd
        sudo systemctl disable httpd
        echo -e "${GREEN}✅ httpd stopped and disabled${NC}"
    fi
else
    echo -e "${GREEN}✅ Port 80 is free${NC}"
fi

# Step 2: Check Nginx configuration syntax
echo ""
echo -e "${YELLOW}🔍 Testing Nginx configuration...${NC}"
if sudo nginx -t 2>&1; then
    echo -e "${GREEN}✅ Nginx configuration is valid${NC}"
else
    echo -e "${RED}❌ Nginx configuration has errors${NC}"
    echo ""
    echo "Checking for duplicate server blocks..."

    # Check for conflicts
    echo -e "${YELLOW}Checking enabled sites:${NC}"
    ls -la /etc/nginx/sites-enabled/

    # Look for the default site conflict
    if [ -f /etc/nginx/sites-enabled/default ]; then
        echo ""
        echo -e "${YELLOW}Found default site. Checking for conflicts...${NC}"

        # Check if both default and daily3club.com are listening on port 80
        if grep -q "listen 80 default_server" /etc/nginx/sites-enabled/default 2>/dev/null; then
            echo -e "${RED}⚠️ Default site is using port 80 with default_server${NC}"
            echo "Removing default site to avoid conflict..."
            sudo rm /etc/nginx/sites-enabled/default
            echo -e "${GREEN}✅ Default site removed${NC}"
        fi
    fi
fi

# Step 3: Check for permission issues
echo ""
echo -e "${YELLOW}🔐 Checking Nginx permissions...${NC}"
if [ -d /var/log/nginx ]; then
    sudo chown -R www-data:adm /var/log/nginx 2>/dev/null || true
    echo -e "${GREEN}✅ Log directory permissions fixed${NC}"
else
    sudo mkdir -p /var/log/nginx
    sudo chown -R www-data:adm /var/log/nginx
    echo -e "${GREEN}✅ Log directory created${NC}"
fi

# Step 4: Check systemd logs for specific error
echo ""
echo -e "${YELLOW}📝 Recent Nginx error logs:${NC}"
sudo journalctl -u nginx --no-pager -n 20 | grep -E "error|failed|Error|Failed" | tail -10 || echo "No recent errors in journal"

# Step 5: Try to start Nginx again
echo ""
echo -e "${YELLOW}🚀 Attempting to start Nginx...${NC}"
if sudo systemctl start nginx; then
    echo -e "${GREEN}✅ Nginx started successfully!${NC}"
    sudo systemctl enable nginx
    echo -e "${GREEN}✅ Nginx enabled for auto-start${NC}"
else
    echo -e "${RED}❌ Failed to start Nginx${NC}"
    echo ""
    echo -e "${YELLOW}Detailed error:${NC}"
    sudo systemctl status nginx --no-pager

    echo ""
    echo -e "${YELLOW}Trying alternative fix...${NC}"

    # Kill any nginx processes
    sudo pkill -f nginx || true
    sleep 2

    # Remove PID file if it exists
    sudo rm -f /run/nginx.pid

    # Try starting directly
    echo "Starting Nginx directly..."
    if sudo nginx; then
        echo -e "${GREEN}✅ Nginx started directly${NC}"

        # Now try with systemctl
        sudo systemctl stop nginx 2>/dev/null || true
        sleep 1
        if sudo systemctl start nginx; then
            echo -e "${GREEN}✅ Systemctl can now manage Nginx${NC}"
        fi
    else
        echo -e "${RED}❌ Direct start also failed${NC}"
        echo ""
        echo "Error details:"
        sudo nginx -t
    fi
fi

# Step 6: Final status check
echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📊 FINAL STATUS${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ NGINX IS RUNNING${NC}"
    echo ""

    # Test the configuration
    echo -e "${YELLOW}Testing proxy configuration...${NC}"

    # Check if app is running
    if pm2 list | grep -q "market-scanner"; then
        echo -e "${GREEN}✅ market-scanner is running in PM2${NC}"

        # Test localhost
        if curl -s http://localhost:3050 2>/dev/null | head -c 50 | grep -q "DOCTYPE"; then
            echo -e "${GREEN}✅ App responding on port 3050${NC}"
        else
            echo -e "${YELLOW}⚠️ App not responding on port 3050${NC}"
            echo "Restarting app..."
            pm2 restart market-scanner
        fi
    else
        echo -e "${YELLOW}⚠️ market-scanner not found in PM2${NC}"
        echo "Starting app..."
        cd ~/vee-hour-strategy
        pm2 start unified-scanner.js --name market-scanner
        pm2 save
    fi

    # Show access info
    SERVER_IP=$(hostname -I | awk '{print $1}')
    echo ""
    echo -e "${CYAN}🌐 ACCESS INFORMATION:${NC}"
    echo "Current access: http://${SERVER_IP}:3050"
    echo "After DNS setup: http://daily3club.com"
    echo ""
    echo -e "${CYAN}📋 DNS SETUP REQUIRED:${NC}"
    echo "Add these records at your domain registrar:"
    echo "  A Record: @ → ${SERVER_IP}"
    echo "  CNAME: www → daily3club.com"
else
    echo -e "${RED}❌ NGINX IS NOT RUNNING${NC}"
    echo ""
    echo "Manual debugging steps:"
    echo "1. Check config: sudo nginx -t"
    echo "2. Check ports: sudo lsof -i :80"
    echo "3. Check logs: sudo tail -f /var/log/nginx/error.log"
    echo "4. Try manual start: sudo nginx"
fi