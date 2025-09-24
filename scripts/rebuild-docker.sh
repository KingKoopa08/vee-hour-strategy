#!/bin/bash

# Rebuild Docker containers for the market scanner application
# This will create a containerized environment with the WebSocket fix

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🐳 REBUILDING DOCKER ENVIRONMENT${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Stopping PM2 (non-Docker) process...${NC}"
pm2 stop market-scanner 2>/dev/null || true
pm2 delete market-scanner 2>/dev/null || true
echo -e "${GREEN}✅ PM2 processes stopped${NC}"

echo ""
echo -e "${YELLOW}📋 Step 2: Creating Dockerfile for market scanner...${NC}"

cat > Dockerfile << 'EOF'
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application code
COPY . .

# Expose ports
EXPOSE 3050 3051

# Start the application
CMD ["node", "unified-scanner.js"]
EOF

echo -e "${GREEN}✅ Dockerfile created${NC}"

echo ""
echo -e "${YELLOW}📋 Step 3: Creating docker-compose.yml...${NC}"

cat > docker-compose.market-scanner.yml << 'EOF'
version: '3.8'

services:
  market-scanner:
    build: .
    container_name: market-scanner
    restart: unless-stopped
    ports:
      - "3050:3050"
      - "3051:3051"
    environment:
      - NODE_ENV=production
      - POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV
      - PORT=3050
      - WS_PORT=3051
    volumes:
      - ./logs:/app/logs
    networks:
      - market-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3050/api/gainers"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    container_name: market-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - market-scanner
    networks:
      - market-network

networks:
  market-network:
    driver: bridge
EOF

echo -e "${GREEN}✅ docker-compose.yml created${NC}"

echo ""
echo -e "${YELLOW}📋 Step 4: Creating nginx configuration for Docker...${NC}"

cat > nginx.conf << 'EOF'
upstream market-scanner {
    server market-scanner:3050;
}

upstream websocket {
    server market-scanner:3051;
}

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
    ssl_prefer_server_ciphers on;

    # Disable caching completely
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Main application
    location / {
        proxy_pass http://market-scanner;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable proxy caching
        proxy_cache off;
        proxy_buffering off;
    }

    # WebSocket endpoint - CRITICAL for WSS
    location /ws {
        proxy_pass http://websocket;
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

    # API endpoints
    location /api/ {
        proxy_pass http://market-scanner;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable caching
        proxy_cache off;
        proxy_buffering off;
    }
}
EOF

echo -e "${GREEN}✅ nginx.conf created${NC}"

echo ""
echo -e "${YELLOW}📋 Step 5: Ensuring WebSocket fix is in code...${NC}"

# Check if fix exists
if ! grep -q "window.location.protocol === 'https:'" unified-scanner.js; then
    echo "Applying WebSocket fix..."
    sed -i "s/const wsUrl = 'ws:\/\/' + wsHost + ':3051';/const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';\n            const wsUrl = protocol === 'wss:' ? protocol + '\/\/' + wsHost + '\/ws' : protocol + '\/\/' + wsHost + ':3051';/g" unified-scanner.js
    echo -e "${GREEN}✅ WebSocket fix applied${NC}"
else
    echo -e "${GREEN}✅ WebSocket fix already present${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Step 6: Stopping existing containers...${NC}"

# Stop system nginx to free port 80/443
sudo systemctl stop nginx 2>/dev/null || true

# Stop any existing containers
docker-compose -f docker-compose.market-scanner.yml down 2>/dev/null || true
docker stop market-scanner market-nginx 2>/dev/null || true
docker rm market-scanner market-nginx 2>/dev/null || true

echo -e "${GREEN}✅ Existing containers stopped${NC}"

echo ""
echo -e "${YELLOW}📋 Step 7: Building Docker image...${NC}"

docker build --no-cache -t market-scanner:latest .

echo -e "${GREEN}✅ Docker image built${NC}"

echo ""
echo -e "${YELLOW}📋 Step 8: Starting Docker containers...${NC}"

docker-compose -f docker-compose.market-scanner.yml up -d

echo -e "${GREEN}✅ Containers started${NC}"

echo ""
echo -e "${YELLOW}📋 Step 9: Waiting for containers to be ready...${NC}"

sleep 5

echo ""
echo -e "${YELLOW}📋 Step 10: Testing the setup...${NC}"

# Check container status
docker ps | grep market-

echo ""
# Test application
if curl -s http://localhost:3050/gainers | grep -q "window.location.protocol === 'https:'"; then
    echo -e "${GREEN}✅ Application serving correct WebSocket code${NC}"
else
    echo -e "${RED}❌ Application may still have old code${NC}"
fi

echo ""
# View logs
echo -e "${YELLOW}Recent logs:${NC}"
docker logs market-scanner --tail 10

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🐳 DOCKER REBUILD COMPLETE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}Docker environment has been rebuilt!${NC}"
echo ""
echo -e "${YELLOW}Container status:${NC}"
docker-compose -f docker-compose.market-scanner.yml ps
echo ""
echo -e "${YELLOW}To monitor:${NC}"
echo "docker logs -f market-scanner"
echo "docker logs -f market-nginx"
echo ""
echo -e "${YELLOW}To stop:${NC}"
echo "docker-compose -f docker-compose.market-scanner.yml down"
echo ""
echo -e "${GREEN}NOW TEST:${NC}"
echo "1. Clear browser cache completely"
echo "2. Open NEW incognito window"
echo "3. Visit https://daily3club.com/gainers"
echo "4. WebSocket should connect via wss://daily3club.com/ws"