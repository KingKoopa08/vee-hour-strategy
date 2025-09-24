#!/bin/bash

# Complete environment rebuild - nuclear option
# This will completely rebuild everything from scratch

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔄 COMPLETE ENVIRONMENT REBUILD${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""
echo -e "${RED}⚠️  WARNING: This will completely rebuild the environment${NC}"
echo ""

# Get current directory
CURRENT_DIR=$(pwd)
echo "Current directory: $CURRENT_DIR"

echo ""
echo -e "${YELLOW}📋 Step 1: Stopping all processes...${NC}"

# Kill PM2
pm2 kill 2>/dev/null || true

# Kill all node processes
pkill -f node 2>/dev/null || true
pkill -f unified-scanner 2>/dev/null || true

echo -e "${GREEN}✅ All processes stopped${NC}"

echo ""
echo -e "${YELLOW}📋 Step 2: Backing up configuration...${NC}"

# Backup .env file
if [ -f ".env" ]; then
    cp .env /tmp/env.backup
    echo "✅ .env backed up"
fi

echo ""
echo -e "${YELLOW}📋 Step 3: Removing old directory completely...${NC}"

cd /opt
rm -rf vee-hour-strategy.old 2>/dev/null || true
mv vee-hour-strategy vee-hour-strategy.old

echo -e "${GREEN}✅ Old directory moved to vee-hour-strategy.old${NC}"

echo ""
echo -e "${YELLOW}📋 Step 4: Cloning fresh from GitHub...${NC}"

git clone https://github.com/KingKoopa08/vee-hour-strategy.git
cd vee-hour-strategy

echo -e "${GREEN}✅ Fresh clone complete${NC}"

echo ""
echo -e "${YELLOW}📋 Step 5: Restoring configuration...${NC}"

if [ -f "/tmp/env.backup" ]; then
    cp /tmp/env.backup .env
    echo "✅ .env restored"
else
    echo "Creating new .env file..."
    cat > .env << EOF
# Polygon.io API
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Environment
NODE_ENV=production
EOF
    echo "✅ .env created"
fi

echo ""
echo -e "${YELLOW}📋 Step 6: Installing dependencies...${NC}"

npm install --production

echo -e "${GREEN}✅ Dependencies installed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 7: Verifying WebSocket fix is in code...${NC}"

echo "Checking lines 1000-1010:"
sed -n '1000,1010p' unified-scanner.js

if grep -q "window.location.protocol === 'https:'" unified-scanner.js; then
    echo -e "${GREEN}✅ WebSocket fix is present in code${NC}"
else
    echo -e "${RED}❌ WebSocket fix missing - applying it now${NC}"

    # Apply the fix using sed
    sed -i "s/const wsUrl = 'ws:\/\/' + wsHost + ':3051';/const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';\n            const wsUrl = protocol === 'wss:' ? protocol + '\/\/' + wsHost + '\/ws' : protocol + '\/\/' + wsHost + ':3051';/g" unified-scanner.js

    echo -e "${GREEN}✅ Fix applied${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Step 8: Setting up PM2 fresh...${NC}"

# Clear PM2 completely
rm -rf ~/.pm2

# Start PM2 fresh
pm2 start unified-scanner.js --name market-scanner \
  --max-memory-restart 1G \
  --log-date-format="YYYY-MM-DD HH:mm:ss" \
  --time

pm2 save
pm2 startup systemd -u root --hp /root

echo -e "${GREEN}✅ PM2 configured${NC}"

echo ""
echo -e "${YELLOW}📋 Step 9: Configuring nginx...${NC}"

# Create nginx config with no caching
cat > /tmp/daily3club-fresh.conf << 'EOF'
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name daily3club.com www.daily3club.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/daily3club.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/daily3club.com/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # DISABLE ALL CACHING - IMPORTANT!
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Main application
    location / {
        proxy_pass http://127.0.0.1:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CRITICAL: Disable all caching
        proxy_cache off;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
        proxy_buffering off;
        expires -1;
    }

    # WebSocket support - CRITICAL for WSS
    location /ws {
        proxy_pass http://127.0.0.1:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;

        # No buffering for WebSocket
        proxy_buffering off;
    }
}
EOF

# Install nginx config
sudo cp /tmp/daily3club-fresh.conf /etc/nginx/sites-available/daily3club.com
sudo ln -sf /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-enabled/

# Test and reload nginx
if sudo nginx -t; then
    sudo systemctl reload nginx
    echo -e "${GREEN}✅ Nginx configured and reloaded${NC}"
else
    echo -e "${RED}❌ Nginx config error${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Step 10: Clearing all caches...${NC}"

# Clear nginx cache
sudo rm -rf /var/cache/nginx/*
sudo rm -rf /tmp/nginx-cache/*

# Clear npm cache
npm cache clean --force

echo -e "${GREEN}✅ All caches cleared${NC}"

echo ""
echo -e "${YELLOW}📋 Step 11: Testing the setup...${NC}"

sleep 3

# Test direct connection
echo "Testing direct connection to app:"
if curl -s http://localhost:3050/gainers | grep -q "window.location.protocol === 'https:'"; then
    echo -e "${GREEN}✅ App is serving correct WebSocket code${NC}"
else
    echo -e "${RED}❌ App is still serving old code${NC}"
fi

echo ""
# Test through nginx
echo "Testing through nginx:"
if curl -sk https://localhost/gainers | grep -q "window.location.protocol === 'https:'" 2>/dev/null; then
    echo -e "${GREEN}✅ Nginx is serving correct WebSocket code${NC}"
else
    echo -e "${YELLOW}⚠️  Cannot test HTTPS locally${NC}"
fi

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}✅ COMPLETE REBUILD FINISHED${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}Environment has been completely rebuilt!${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT - Final steps:${NC}"
echo "1. Clear your browser cache COMPLETELY"
echo "2. Close all browser tabs for daily3club.com"
echo "3. Open a NEW incognito/private window"
echo "4. Visit https://daily3club.com/gainers"
echo ""
echo -e "${GREEN}The WebSocket should now connect via wss://daily3club.com/ws${NC}"
echo ""
echo -e "${YELLOW}Monitor with:${NC}"
echo "pm2 logs market-scanner"
echo "pm2 monit"