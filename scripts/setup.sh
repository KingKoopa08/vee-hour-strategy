#!/bin/bash

# Initial VPS Setup Script
# Run this first on a fresh VPS to prepare the environment
# Usage: bash setup.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}🔧 VPS INITIAL SETUP${NC}"
echo -e "${GREEN}===============================================${NC}"

# Update system
echo -e "${YELLOW}📦 Updating system packages...${NC}"
sudo apt-get update
sudo apt-get upgrade -y

# Install essential tools
echo -e "${YELLOW}📦 Installing essential tools...${NC}"
sudo apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    htop \
    ufw \
    nginx

# Install Node.js 18
echo -e "${YELLOW}📦 Installing Node.js 18...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node installation
echo -e "${GREEN}✅ Node.js $(node --version) installed${NC}"
echo -e "${GREEN}✅ npm $(npm --version) installed${NC}"

# Install PM2 globally
echo -e "${YELLOW}📦 Installing PM2...${NC}"
sudo npm install -g pm2

# Setup firewall
echo -e "${YELLOW}🔒 Configuring firewall...${NC}"
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3050/tcp  # Scanner API
sudo ufw allow 3051/tcp  # WebSocket
sudo ufw allow 3000/tcp  # PreMarket Server
echo "y" | sudo ufw enable

# Create app directory
echo -e "${YELLOW}📁 Creating application directory...${NC}"
sudo mkdir -p /opt/market-scanner
sudo chown $USER:$USER /opt/market-scanner

# Setup nginx (optional)
echo -e "${YELLOW}🌐 Setting up nginx...${NC}"
sudo systemctl start nginx
sudo systemctl enable nginx

# Create nginx config
sudo tee /etc/nginx/sites-available/market-scanner > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Enable nginx site
sudo ln -sf /etc/nginx/sites-available/market-scanner /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}✅ INITIAL SETUP COMPLETE!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Run the deployment script:"
echo "   curl -s https://raw.githubusercontent.com/KingKoopa08/vee-hour-strategy/main/scripts/deploy.sh | bash"
echo ""
echo -e "${GREEN}System Info:${NC}"
echo "   Node.js: $(node --version)"
echo "   npm: $(npm --version)"
echo "   PM2: $(pm2 --version)"
echo ""
echo -e "${GREEN}Firewall Status:${NC}"
sudo ufw status numbered