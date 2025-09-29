#!/bin/bash

# ============================================
# ONE-COMMAND PRODUCTION DEPLOYMENT
# Usage: ./deploy-production.sh [server-ip]
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SERVER_IP="${1}"
REPO_URL="https://github.com/yourusername/PreMarket_Strategy.git"  # UPDATE THIS
APP_DIR="/opt/premarket-scanner"
SERVICE_NAME="market-scanner"

# Validate input
if [ -z "$SERVER_IP" ]; then
    echo -e "${RED}❌ Error: Server IP required${NC}"
    echo -e "${YELLOW}Usage: ./deploy-production.sh YOUR_SERVER_IP${NC}"
    echo -e "${YELLOW}Example: ./deploy-production.sh 192.168.1.100${NC}"
    exit 1
fi

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🚀 DEPLOYING TO PRODUCTION SERVER${NC}"
echo -e "${CYAN}   Server: ${SERVER_IP}${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Create deployment package
echo -e "${YELLOW}📦 Creating deployment package...${NC}"
cat > /tmp/deploy-remote.sh << 'REMOTE_SCRIPT'
#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

APP_DIR="/opt/premarket-scanner"
SERVICE_NAME="market-scanner"

echo -e "${CYAN}🚀 Starting deployment on server...${NC}"

# Step 1: Install dependencies if needed
echo -e "${YELLOW}📋 Checking dependencies...${NC}"
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

if ! command -v git &> /dev/null; then
    echo "Installing Git..."
    sudo apt-get install -y git
fi

# Step 2: Clone or update repository
echo -e "${YELLOW}📋 Setting up application...${NC}"
if [ -d "$APP_DIR" ]; then
    echo "Updating existing installation..."
    cd $APP_DIR
    git stash
    git pull origin main || git pull origin master
else
    echo "Fresh installation..."
    sudo mkdir -p $APP_DIR
    cd /opt
    sudo git clone REPO_URL_PLACEHOLDER premarket-scanner
    cd $APP_DIR
fi

# Step 3: Install npm dependencies
echo -e "${YELLOW}📋 Installing dependencies...${NC}"
npm install --production

# Step 4: Setup environment
echo -e "${YELLOW}📋 Configuring environment...${NC}"
if [ ! -f .env ]; then
    cat > .env << 'ENV_FILE'
# Polygon API Configuration
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Environment
NODE_ENV=production
ENV_FILE
    echo -e "${GREEN}✅ Environment configured${NC}"
else
    echo "Using existing .env file"
fi

# Step 5: Stop existing service
echo -e "${YELLOW}📋 Stopping existing services...${NC}"
pm2 stop $SERVICE_NAME 2>/dev/null || true
pm2 delete $SERVICE_NAME 2>/dev/null || true

# Kill any processes on our ports
sudo fuser -k 3050/tcp 2>/dev/null || true
sudo fuser -k 3051/tcp 2>/dev/null || true

# Step 6: Start with PM2
echo -e "${YELLOW}📋 Starting application...${NC}"
pm2 start unified-scanner.js --name $SERVICE_NAME \
    --max-memory-restart 1G \
    --log-date-format="YYYY-MM-DD HH:mm:ss" \
    --merge-logs \
    --time

pm2 save
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

# Step 7: Setup Nginx if needed
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}📋 Installing Nginx...${NC}"
    sudo apt-get install -y nginx
fi

# Create Nginx config if it doesn't exist
if [ ! -f /etc/nginx/sites-available/market-scanner ]; then
    echo -e "${YELLOW}📋 Configuring Nginx...${NC}"
    sudo tee /etc/nginx/sites-available/market-scanner > /dev/null << 'NGINX_CONFIG'
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
NGINX_CONFIG

    sudo ln -sf /etc/nginx/sites-available/market-scanner /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t
    sudo systemctl reload nginx
fi

# Step 8: Configure firewall
echo -e "${YELLOW}📋 Configuring firewall...${NC}"
if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp 2>/dev/null || true
    sudo ufw allow 80/tcp 2>/dev/null || true
    sudo ufw allow 443/tcp 2>/dev/null || true
    sudo ufw allow 3050/tcp 2>/dev/null || true
    sudo ufw allow 3051/tcp 2>/dev/null || true
    echo "y" | sudo ufw enable 2>/dev/null || true
fi

# Step 9: Verify deployment
echo -e "${YELLOW}📋 Verifying deployment...${NC}"
sleep 5

# Check PM2
if pm2 list | grep -q $SERVICE_NAME; then
    echo -e "${GREEN}✅ PM2 service running${NC}"
else
    echo -e "${RED}❌ PM2 service not running${NC}"
    pm2 logs $SERVICE_NAME --lines 20
    exit 1
fi

# Check HTTP endpoint
if curl -s http://localhost:3050 > /dev/null; then
    echo -e "${GREEN}✅ HTTP server responding${NC}"
else
    echo -e "${RED}❌ HTTP server not responding${NC}"
    pm2 logs $SERVICE_NAME --lines 20
    exit 1
fi

# Check API endpoint
if curl -s http://localhost:3050/api/gainers | grep -q "symbol"; then
    echo -e "${GREEN}✅ API endpoints working${NC}"
else
    echo -e "${YELLOW}⚠️  API may still be initializing${NC}"
fi

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Access your scanner at:${NC}"
echo -e "  Main Hub:      ${CYAN}http://$(hostname -I | awk '{print $1}'):3050${NC}"
echo -e "  Volume Movers: ${CYAN}http://$(hostname -I | awk '{print $1}'):3050/volume${NC}"
echo -e "  Top Gainers:   ${CYAN}http://$(hostname -I | awk '{print $1}'):3050/gainers${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  View logs:     ${CYAN}pm2 logs $SERVICE_NAME${NC}"
echo -e "  Monitor:       ${CYAN}pm2 monit${NC}"
echo -e "  Restart:       ${CYAN}pm2 restart $SERVICE_NAME${NC}"
echo -e "  Status:        ${CYAN}pm2 status${NC}"

REMOTE_SCRIPT

# Replace repo URL in script
sed -i "s|REPO_URL_PLACEHOLDER|${REPO_URL}|g" /tmp/deploy-remote.sh

echo -e "${GREEN}✅ Deployment package created${NC}"

# Copy and execute on remote server
echo -e "${YELLOW}📋 Connecting to server ${SERVER_IP}...${NC}"
echo -e "${YELLOW}   You may be prompted for SSH password${NC}"
echo ""

# Copy script to server
scp /tmp/deploy-remote.sh root@${SERVER_IP}:/tmp/deploy-remote.sh

# Execute script on server
ssh root@${SERVER_IP} "chmod +x /tmp/deploy-remote.sh && /tmp/deploy-remote.sh"

# Cleanup
rm /tmp/deploy-remote.sh

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Your PreMarket Scanner is now live at:${NC}"
echo -e "  ${CYAN}http://${SERVER_IP}:3050${NC}"
echo ""
echo -e "${YELLOW}To monitor the application:${NC}"
echo -e "  ${CYAN}ssh root@${SERVER_IP} -t 'pm2 logs market-scanner'${NC}"