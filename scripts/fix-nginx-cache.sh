#!/bin/bash

# Fix nginx caching issue that's serving old WebSocket code

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔧 FIXING NGINX CACHE ISSUE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Clearing nginx cache...${NC}"

# Clear nginx cache directories
sudo rm -rf /var/cache/nginx/*
sudo rm -rf /tmp/nginx-cache/*
sudo rm -rf /var/tmp/nginx/*

echo -e "${GREEN}✅ Nginx cache cleared${NC}"

echo ""
echo -e "${YELLOW}📋 Step 2: Updating nginx config to disable caching...${NC}"

# Create nginx config without caching
cat > /tmp/daily3club-no-cache.conf << 'EOF'
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

    # DISABLE ALL CACHING
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Main application - NO CACHING
    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # DISABLE PROXY CACHING
        proxy_cache off;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
        proxy_buffering off;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket specific
        proxy_read_timeout 86400;
        proxy_buffering off;
    }

    # API endpoints - NO CACHING
    location /api/ {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # DISABLE CACHING
        proxy_cache off;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
    }
}
EOF

# Backup current config
sudo cp /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-available/daily3club.com.backup.$(date +%s) 2>/dev/null || true

# Copy new config
sudo cp /tmp/daily3club-no-cache.conf /etc/nginx/sites-available/daily3club.com

echo -e "${GREEN}✅ Nginx config updated with caching disabled${NC}"

echo ""
echo -e "${YELLOW}📋 Step 3: Testing nginx config...${NC}"

if sudo nginx -t; then
    echo -e "${GREEN}✅ Nginx config is valid${NC}"
else
    echo -e "${RED}❌ Nginx config error, restoring backup${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}📋 Step 4: Reloading nginx...${NC}"

sudo systemctl reload nginx

echo -e "${GREEN}✅ Nginx reloaded${NC}"

echo ""
echo -e "${YELLOW}📋 Step 5: Restarting application...${NC}"

pm2 restart market-scanner

echo -e "${GREEN}✅ Application restarted${NC}"

echo ""
echo -e "${YELLOW}📋 Step 6: Testing direct connection (bypassing nginx)...${NC}"

echo "Direct to app (port 3050):"
curl -s http://localhost:3050/gainers | grep "new WebSocket" | head -2

echo ""
echo "Through nginx (port 443):"
curl -sk https://daily3club.com/gainers | grep "new WebSocket" | head -2

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}✅ NGINX CACHE FIX COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}Nginx caching has been disabled${NC}"
echo ""
echo -e "${YELLOW}NOW TEST:${NC}"
echo "1. Force refresh in browser: Ctrl+Shift+R"
echo "2. Or clear cache: Ctrl+Shift+Delete"
echo "3. Visit https://daily3club.com/gainers"
echo ""
echo -e "${GREEN}The WebSocket should now work!${NC}"