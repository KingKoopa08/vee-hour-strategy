#!/bin/bash

# ============================================
# PREMARKET SCANNER - SERVER INSTALLATION
# Run this directly on your server
# Usage: ./install.sh
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 PREMARKET SCANNER INSTALLATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Step 1: Update system
echo -e "${YELLOW}📦 Updating system packages...${NC}"
apt update && apt upgrade -y

# Step 2: Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}📦 Installing Node.js 18...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
else
    echo -e "${GREEN}✅ Node.js already installed${NC}"
fi

# Step 3: Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}📦 Installing PM2...${NC}"
    npm install -g pm2
else
    echo -e "${GREEN}✅ PM2 already installed${NC}"
fi

# Step 4: Install other dependencies
echo -e "${YELLOW}📦 Installing system dependencies...${NC}"
apt install -y git nginx ufw

# Step 5: Setup firewall
echo -e "${YELLOW}🔒 Configuring firewall...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3050/tcp
ufw allow 3051/tcp
echo "y" | ufw enable || true

# Step 6: Create app directory
echo -e "${YELLOW}📁 Setting up application...${NC}"
APP_DIR="/opt/premarket-scanner"
if [ -d "$APP_DIR" ]; then
    echo -e "${YELLOW}⚠️  App directory exists. Backing up...${NC}"
    mv $APP_DIR ${APP_DIR}.backup.$(date +%Y%m%d-%H%M%S)
fi

mkdir -p $APP_DIR
cd $APP_DIR

# Step 7: Copy application files
echo -e "${YELLOW}📋 Copying application files...${NC}"
cp -r /mnt/d/Cursor\ Ideas/PreMarket_Stratedy/* $APP_DIR/ || {
    echo -e "${RED}❌ Failed to copy files. Are you running this from the right location?${NC}"
    echo -e "${YELLOW}Alternative: Clone from git repository${NC}"
    read -p "Enter git repository URL (or press Enter to skip): " REPO_URL
    if [ ! -z "$REPO_URL" ]; then
        git clone $REPO_URL $APP_DIR
    else
        exit 1
    fi
}

# Step 8: Install npm packages
echo -e "${YELLOW}📦 Installing npm packages...${NC}"
cd $APP_DIR
npm install --production

# Step 9: Setup environment
echo -e "${YELLOW}⚙️ Configuring environment...${NC}"
if [ ! -f .env ]; then
    cat > .env << EOF
# Polygon API Configuration
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Environment
NODE_ENV=production
EOF
    echo -e "${GREEN}✅ Environment configured${NC}"
else
    echo -e "${YELLOW}Using existing .env file${NC}"
fi

# Step 10: Setup PM2
echo -e "${YELLOW}🚀 Starting application with PM2...${NC}"
pm2 delete market-scanner 2>/dev/null || true
pm2 start unified-scanner.js --name market-scanner \
    --max-memory-restart 1G \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --merge-logs \
    --time

pm2 save
pm2 startup systemd -u root --hp /root

# Step 11: Setup Nginx
echo -e "${YELLOW}🌐 Configuring Nginx...${NC}"
cat > /etc/nginx/sites-available/market-scanner << 'EOF'
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
        proxy_read_timeout 86400;
    }

    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF

ln -sf /etc/nginx/sites-available/market-scanner /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# Step 12: Setup health check cron
echo -e "${YELLOW}🏥 Setting up health monitoring...${NC}"
if [ -f "$APP_DIR/health-check.sh" ]; then
    chmod +x $APP_DIR/health-check.sh
    (crontab -l 2>/dev/null | grep -v "health-check.sh" ; echo "*/5 * * * * $APP_DIR/health-check.sh") | crontab -
    echo -e "${GREEN}✅ Health monitoring enabled${NC}"
fi

# Step 13: Verify installation
echo -e "${YELLOW}🔍 Verifying installation...${NC}"
sleep 5

if pm2 list | grep -q market-scanner; then
    echo -e "${GREEN}✅ PM2 service running${NC}"
else
    echo -e "${RED}❌ PM2 service not running${NC}"
fi

if curl -s http://localhost:3050 > /dev/null; then
    echo -e "${GREEN}✅ HTTP server responding${NC}"
else
    echo -e "${RED}❌ HTTP server not responding${NC}"
fi

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ INSTALLATION COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Access your scanner at:${NC}"
echo -e "  Main Hub:      ${CYAN}http://${SERVER_IP}:3050${NC}"
echo -e "  Volume Movers: ${CYAN}http://${SERVER_IP}:3050/volume${NC}"
echo -e "  Top Gainers:   ${CYAN}http://${SERVER_IP}:3050/gainers${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  View logs:     ${CYAN}pm2 logs market-scanner${NC}"
echo -e "  Monitor:       ${CYAN}pm2 monit${NC}"
echo -e "  Restart:       ${CYAN}pm2 restart market-scanner${NC}"
echo -e "  Update:        ${CYAN}./update.sh${NC}"