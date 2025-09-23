#!/bin/bash

# Fix Nginx and Complete Domain Setup
# This script starts Nginx and verifies the domain configuration

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔧 FIXING NGINX AND COMPLETING SETUP${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Step 1: Start Nginx
echo -e "${YELLOW}🚀 Starting Nginx service...${NC}"
sudo systemctl start nginx
sleep 2

# Check if Nginx started
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ Nginx is now running${NC}"
else
    echo -e "${RED}❌ Failed to start Nginx${NC}"
    echo "Checking for errors..."
    sudo journalctl -xe | grep nginx | tail -20
    exit 1
fi

# Step 2: Enable Nginx to start on boot
echo ""
echo -e "${YELLOW}⚙️ Enabling Nginx to start on boot...${NC}"
sudo systemctl enable nginx
echo -e "${GREEN}✅ Nginx enabled for auto-start${NC}"

# Step 3: Test the configuration
echo ""
echo -e "${YELLOW}🔍 Testing Nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✅ Configuration is valid${NC}"
else
    echo -e "${RED}❌ Configuration has errors${NC}"
    exit 1
fi

# Step 4: Reload Nginx with new configuration
echo ""
echo -e "${YELLOW}🔄 Reloading Nginx with domain configuration...${NC}"
sudo systemctl reload nginx
echo -e "${GREEN}✅ Nginx reloaded successfully${NC}"

# Step 5: Check if application is running
echo ""
echo -e "${YELLOW}📊 Checking if application is running on port 3050...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3050 | grep -q "200"; then
    echo -e "${GREEN}✅ Application is responding on port 3050${NC}"
else
    echo -e "${YELLOW}⚠️ Application not responding on port 3050${NC}"
    echo ""
    echo "Starting the application with PM2..."

    # Check if PM2 process exists
    if pm2 list | grep -q "market-scanner"; then
        pm2 restart market-scanner
        echo -e "${GREEN}✅ Restarted market-scanner${NC}"
    else
        # Start the scanner
        cd ~/vee-hour-strategy
        pm2 start unified-scanner.js --name market-scanner
        pm2 save
        echo -e "${GREEN}✅ Started market-scanner${NC}"
    fi

    sleep 5

    # Test again
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3050 | grep -q "200"; then
        echo -e "${GREEN}✅ Application is now responding${NC}"
    else
        echo -e "${RED}❌ Application still not responding${NC}"
        echo "Check with: pm2 logs market-scanner"
    fi
fi

# Step 6: Show status
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}✅ NGINX SETUP COMPLETE!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "${CYAN}📋 Current Status:${NC}"
echo ""
echo "Nginx Status:"
sudo systemctl status nginx --no-pager | head -10
echo ""
echo "PM2 Processes:"
pm2 list
echo ""

echo -e "${CYAN}📋 Next Steps - DNS Configuration:${NC}"
echo ""
echo "1. Go to your domain registrar (where you bought daily3club.com)"
echo "2. Add these DNS records:"
echo ""
echo -e "${YELLOW}   Type: A${NC}"
echo "   Name: @ (or daily3club.com)"
echo "   Value: ${SERVER_IP}"
echo "   TTL: 3600 (or lowest available)"
echo ""
echo -e "${YELLOW}   Type: CNAME${NC}"
echo "   Name: www"
echo "   Value: daily3club.com"
echo "   TTL: 3600"
echo ""

echo -e "${CYAN}📋 Testing (after DNS propagates):${NC}"
echo ""
echo "1. Test DNS (5-30 minutes after configuration):"
echo "   nslookup daily3club.com"
echo "   Should return: ${SERVER_IP}"
echo ""
echo "2. Test HTTP access:"
echo "   curl http://daily3club.com"
echo ""
echo "3. Once DNS works, setup SSL:"
echo -e "${GREEN}   sudo ./scripts/setup-ssl.sh${NC}"
echo ""

echo -e "${CYAN}🔍 Quick Tests:${NC}"
echo ""
echo "Testing localhost..."
if curl -s http://localhost:3050/api/gainers | head -c 100 | grep -q "success"; then
    echo -e "${GREEN}✅ API is working on localhost:3050${NC}"
else
    echo -e "${RED}❌ API not responding${NC}"
fi

echo ""
echo "Testing through Nginx on port 80..."
if curl -s -H "Host: daily3club.com" http://localhost/api/gainers 2>/dev/null | head -c 100 | grep -q "success"; then
    echo -e "${GREEN}✅ Nginx proxy is working${NC}"
else
    echo -e "${YELLOW}⚠️ Nginx proxy needs checking${NC}"
fi

echo ""
echo -e "${CYAN}💡 Important:${NC}"
echo "The domain will only work after you configure DNS records!"
echo "Current access: http://${SERVER_IP}:3050"