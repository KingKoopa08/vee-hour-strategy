#!/bin/bash

# Fix routing - ensure daily3club.com goes to market scanner on port 3050

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔧 FIXING ROUTING FOR daily3club.com${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Step 1: Check what's actually on port 80
echo -e "${YELLOW}📊 Checking what's handling port 80...${NC}"
sudo lsof -i :80 | grep LISTEN || echo "Nothing on port 80"
echo ""

# Step 2: Check if THC nginx restarted
echo -e "${YELLOW}🔍 Checking for Docker nginx containers...${NC}"
sudo docker ps | grep nginx || echo "No nginx containers running"
echo ""

# Step 3: Stop any Docker container on port 80
echo -e "${YELLOW}🛑 Stopping any Docker containers on port 80...${NC}"
CONTAINER_ON_80=$(sudo docker ps --filter "publish=80" -q)
if [ ! -z "$CONTAINER_ON_80" ]; then
    CONTAINER_NAME=$(sudo docker ps --filter "id=$CONTAINER_ON_80" --format "{{.Names}}")
    echo "Found container on port 80: $CONTAINER_NAME"
    echo "Stopping it..."
    sudo docker stop $CONTAINER_NAME
    echo -e "${GREEN}✅ Stopped $CONTAINER_NAME${NC}"
else
    echo "No Docker container on port 80"
fi

# Step 4: Kill any process on port 80
echo ""
echo -e "${YELLOW}🔫 Killing any process on port 80...${NC}"
sudo fuser -k 80/tcp 2>/dev/null || echo "No process to kill"

# Step 5: Ensure market scanner is running
echo ""
echo -e "${YELLOW}✅ Ensuring Market Scanner is running on port 3050...${NC}"
if pm2 list | grep -q "market-scanner"; then
    pm2 restart market-scanner
    echo "Market scanner restarted"
else
    cd ~/vee-hour-strategy
    pm2 start unified-scanner.js --name market-scanner
    pm2 save
    echo "Market scanner started"
fi

# Wait for it to start
sleep 3

# Test market scanner
if curl -s http://localhost:3050 2>/dev/null | head -c 100 | grep -q "DOCTYPE"; then
    echo -e "${GREEN}✅ Market scanner is responding on port 3050${NC}"
else
    echo -e "${RED}❌ Market scanner not responding${NC}"
    echo "Checking PM2 logs:"
    pm2 logs market-scanner --lines 10 --nostream
fi

# Step 6: Configure and start Nginx
echo ""
echo -e "${YELLOW}⚙️ Configuring Nginx for daily3club.com...${NC}"

# Create a clean configuration
sudo tee /etc/nginx/sites-available/daily3club > /dev/null << 'EOF'
# Configuration for daily3club.com
# This MUST route to port 3050 (Market Scanner)

server {
    listen 80;
    listen [::]:80;
    server_name daily3club.com www.daily3club.com;

    # Log files for debugging
    access_log /var/log/nginx/daily3club.access.log;
    error_log /var/log/nginx/daily3club.error.log;

    # Main application on port 3050
    location / {
        proxy_pass http://127.0.0.1:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Debug header to confirm routing
        add_header X-Proxied-To "market-scanner-3050" always;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

# Default server - catch everything else
server {
    listen 80 default_server;
    server_name _;

    # Return 404 for non-configured domains
    location / {
        return 404 "Domain not configured\n";
    }
}
EOF

# Remove all other site configs to avoid conflicts
echo -e "${YELLOW}🗑️ Removing conflicting configurations...${NC}"
sudo rm -f /etc/nginx/sites-enabled/*

# Enable only our config
sudo ln -s /etc/nginx/sites-available/daily3club /etc/nginx/sites-enabled/

# Test configuration
echo ""
echo -e "${YELLOW}🔍 Testing Nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✅ Configuration is valid${NC}"
else
    echo -e "${RED}❌ Configuration error${NC}"
    exit 1
fi

# Start or reload Nginx
echo ""
echo -e "${YELLOW}🚀 Starting Nginx...${NC}"
if systemctl is-active --quiet nginx; then
    sudo systemctl reload nginx
    echo -e "${GREEN}✅ Nginx reloaded${NC}"
else
    sudo systemctl start nginx
    sudo systemctl enable nginx
    echo -e "${GREEN}✅ Nginx started${NC}"
fi

# Step 7: Test the routing
echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🧪 TESTING ROUTING${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

SERVER_IP=$(hostname -I | awk '{print $1}')

# Test with Host header (simulates domain request)
echo -e "${YELLOW}Testing daily3club.com routing...${NC}"
RESPONSE=$(curl -s -H "Host: daily3club.com" http://localhost 2>/dev/null | head -c 200)

if echo "$RESPONSE" | grep -q "Market Scanner\|Top Gainers\|Volume"; then
    echo -e "${GREEN}✅ daily3club.com correctly routes to Market Scanner!${NC}"
else
    echo -e "${RED}❌ Routing issue detected${NC}"
    echo "Response received:"
    echo "$RESPONSE" | head -3
    echo ""
    echo "Checking Nginx logs:"
    sudo tail -5 /var/log/nginx/daily3club.error.log 2>/dev/null || true
fi

# Step 8: Show final status
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}📋 FINAL STATUS${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""

echo -e "${CYAN}✅ Configuration Complete:${NC}"
echo ""
echo "Port 80: $(sudo lsof -i :80 2>/dev/null | grep LISTEN | awk '{print $1}' | head -1 || echo 'Nothing')"
echo "Port 3050: $(sudo lsof -i :3050 2>/dev/null | grep LISTEN | awk '{print $1}' | head -1 || echo 'Nothing')"
echo ""

echo -e "${CYAN}🌐 Access:${NC}"
echo "Direct: http://${SERVER_IP}:3050 (works now)"
echo "Domain: http://daily3club.com (after DNS propagates)"
echo ""

echo -e "${CYAN}📊 Docker Status:${NC}"
sudo docker ps --format "table {{.Names}}\t{{.Ports}}" | head -10
echo ""

echo -e "${CYAN}🔍 Verify with:${NC}"
echo "curl -H 'Host: daily3club.com' http://localhost"
echo "curl http://localhost:3050"
echo ""

echo -e "${YELLOW}💡 If daily3club.com still goes to wrong container:${NC}"
echo "1. Clear browser cache (Ctrl+F5)"
echo "2. Check DNS: nslookup daily3club.com"
echo "3. Check logs: sudo tail -f /var/log/nginx/daily3club.access.log"