#!/bin/bash

# Setup proper routing for all applications
# This handles THC, Trading, and Market Scanner apps

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🚀 SETTING UP PROPER ROUTING${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Step 1: Check current situation
echo -e "${YELLOW}📊 Current Docker containers:${NC}"
sudo docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
echo ""

# Step 2: Find THC nginx
echo -e "${YELLOW}🔍 Looking for THC nginx container...${NC}"
if sudo docker ps -a | grep -q "thc_nginx"; then
    echo "Found thc_nginx (stopped). Starting it..."
    sudo docker start thc_nginx
    sleep 3
    if sudo docker ps | grep -q "thc_nginx"; then
        echo -e "${GREEN}✅ THC nginx started${NC}"
    else
        echo -e "${RED}❌ Failed to start THC nginx${NC}"
        echo "THC nginx logs:"
        sudo docker logs thc_nginx --tail 20
    fi
else
    echo -e "${YELLOW}⚠️ THC nginx container not found${NC}"
fi

# Step 3: Check what's on port 80
echo ""
echo -e "${YELLOW}📡 Checking port 80...${NC}"
if sudo lsof -i :80 2>/dev/null | grep LISTEN; then
    echo "Port 80 is in use"
else
    echo "Port 80 is FREE"

    # Start system nginx to handle routing
    echo -e "${YELLOW}Starting system Nginx as main router...${NC}"

    # Create master routing configuration
    sudo tee /etc/nginx/sites-available/master-router > /dev/null << 'EOF'
# Master router configuration
# Routes different domains to different applications

# Trading application (if it needs a domain later)
server {
    listen 80;
    server_name trading.yourdomain.com;  # Change this to your trading domain

    location / {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Market Scanner - daily3club.com
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;

    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Default server to catch all other requests
server {
    listen 80 default_server;
    server_name _;

    # Point to whichever app should be default
    location / {
        return 404;
    }
}
EOF

    # Enable the configuration
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo ln -sf /etc/nginx/sites-available/master-router /etc/nginx/sites-enabled/
    sudo ln -sf /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-enabled/ 2>/dev/null || true

    # Test and start nginx
    if sudo nginx -t; then
        sudo systemctl start nginx
        sudo systemctl enable nginx
        echo -e "${GREEN}✅ Nginx started as master router${NC}"
    else
        echo -e "${RED}❌ Nginx configuration error${NC}"
    fi
fi

# Step 4: Ensure market scanner is running
echo ""
echo -e "${YELLOW}🔍 Checking Market Scanner (PM2)...${NC}"
if pm2 list | grep -q "market-scanner"; then
    pm2 restart market-scanner
    echo -e "${GREEN}✅ Market scanner restarted${NC}"
else
    echo "Starting market scanner..."
    cd ~/vee-hour-strategy
    pm2 start unified-scanner.js --name market-scanner
    pm2 save
    echo -e "${GREEN}✅ Market scanner started${NC}"
fi

# Step 5: Summary
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}📋 CURRENT SETUP${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""

SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "${CYAN}🌐 Applications Running:${NC}"
echo ""

# Check each application
echo "1. THC Application:"
if sudo docker ps | grep -q "thc_"; then
    echo "   Status: ✅ Running"
    echo "   Containers: $(sudo docker ps | grep thc_ | wc -l) containers"
else
    echo "   Status: ⚠️ Not fully running"
fi

echo ""
echo "2. Trading Application:"
if sudo docker ps | grep -q "trading"; then
    echo "   Status: ✅ Running"
    echo "   Access: http://${SERVER_IP}:3010"
    echo "   Containers: $(sudo docker ps | grep trading | wc -l) containers"
else
    echo "   Status: ❌ Not running"
fi

echo ""
echo "3. Market Scanner:"
if curl -s http://localhost:3050 2>/dev/null | head -c 50 | grep -q "DOCTYPE"; then
    echo "   Status: ✅ Running"
    echo "   Access: http://${SERVER_IP}:3050"
    echo "   Domain: daily3club.com (after DNS setup)"
else
    echo "   Status: ❌ Not responding"
fi

echo ""
echo -e "${CYAN}🔧 Port Usage:${NC}"
echo "   Port 80: $(sudo lsof -i :80 2>/dev/null | grep LISTEN | awk '{print $1}' | head -1 || echo 'FREE')"
echo "   Port 3010: Trading Frontend"
echo "   Port 3050: Market Scanner"
echo "   Port 5434: Trading Database"
echo "   Port 6379: Redis Cache"

echo ""
echo -e "${CYAN}📋 DNS Configuration for daily3club.com:${NC}"
echo "   A Record: @ → ${SERVER_IP}"
echo "   CNAME: www → daily3club.com"

echo ""
echo -e "${CYAN}🔍 Testing Commands:${NC}"
echo "   Test Trading: curl http://localhost:3010"
echo "   Test Scanner: curl http://localhost:3050"
echo "   Test DNS (after setup): curl http://daily3club.com"

echo ""
echo -e "${YELLOW}💡 Notes:${NC}"
echo "- Trading app is on port 3010"
echo "- Market scanner is on port 3050"
echo "- daily3club.com will route to market scanner"
echo "- THC app needs its nginx container fixed"