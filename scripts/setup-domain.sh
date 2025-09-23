#!/bin/bash

# Domain Setup Script for daily3club.com
# This script sets up Nginx reverse proxy to route daily3club.com to port 3050

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
DOMAIN="daily3club.com"
APP_PORT="3050"
WS_PORT="3051"
SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🌐 DOMAIN SETUP FOR ${DOMAIN}${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""
echo -e "${YELLOW}This script will:${NC}"
echo "   1. Install/Update Nginx"
echo "   2. Configure reverse proxy for ${DOMAIN}"
echo "   3. Route traffic to port ${APP_PORT}"
echo "   4. Setup WebSocket support on port ${WS_PORT}"
echo "   5. Optionally setup SSL with Let's Encrypt"
echo ""
echo -e "${YELLOW}Current Server IP: ${SERVER_IP}${NC}"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

# Step 1: Install Nginx if not present
echo ""
echo -e "${YELLOW}📦 Checking Nginx installation...${NC}"
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    sudo apt update
    sudo apt install -y nginx
    echo -e "${GREEN}✅ Nginx installed${NC}"
else
    echo -e "${GREEN}✅ Nginx already installed${NC}"
fi

# Step 2: Create Nginx configuration
echo ""
echo -e "${YELLOW}⚙️ Creating Nginx configuration...${NC}"

# Create the Nginx config file
sudo tee /etc/nginx/sites-available/${DOMAIN} > /dev/null << EOF
# Configuration for ${DOMAIN}
# Routes to application on port ${APP_PORT}

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Main application
    location / {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Timeout settings for long-running connections
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support (if your app uses WebSockets on a different port)
    location /ws {
        proxy_pass http://localhost:${WS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket specific timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # API endpoint (explicit routing)
    location /api {
        proxy_pass http://localhost:${APP_PORT}/api;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

echo -e "${GREEN}✅ Nginx configuration created${NC}"

# Step 3: Enable the site
echo ""
echo -e "${YELLOW}🔗 Enabling site...${NC}"

# Remove default site if it exists
if [ -L /etc/nginx/sites-enabled/default ]; then
    sudo rm /etc/nginx/sites-enabled/default
    echo "   Removed default site"
fi

# Enable our site
if [ ! -L /etc/nginx/sites-enabled/${DOMAIN} ]; then
    sudo ln -s /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
    echo -e "${GREEN}✅ Site enabled${NC}"
else
    echo -e "${GREEN}✅ Site already enabled${NC}"
fi

# Step 4: Test and reload Nginx
echo ""
echo -e "${YELLOW}🔍 Testing Nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✅ Configuration valid${NC}"

    echo ""
    echo -e "${YELLOW}🔄 Reloading Nginx...${NC}"
    sudo systemctl reload nginx
    echo -e "${GREEN}✅ Nginx reloaded${NC}"
else
    echo -e "${RED}❌ Configuration error! Please check the settings.${NC}"
    exit 1
fi

# Step 5: Configure firewall
echo ""
echo -e "${YELLOW}🔥 Configuring firewall...${NC}"

# Check if ufw is active
if sudo ufw status | grep -q "Status: active"; then
    # Allow Nginx
    sudo ufw allow 'Nginx Full' 2>/dev/null || true
    # Allow SSH (just in case)
    sudo ufw allow ssh 2>/dev/null || true
    # Remove direct port access (optional - uncomment if you want to block direct port access)
    # sudo ufw delete allow ${APP_PORT} 2>/dev/null || true
    # sudo ufw delete allow ${WS_PORT} 2>/dev/null || true
    echo -e "${GREEN}✅ Firewall rules updated${NC}"
else
    echo "   Firewall not active, skipping"
fi

# Step 6: Show DNS instructions
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}✅ NGINX SETUP COMPLETE!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""
echo -e "${CYAN}📋 Next Steps - DNS Configuration:${NC}"
echo ""
echo "1. Go to your domain registrar (where you bought ${DOMAIN})"
echo "2. Add these DNS records:"
echo ""
echo -e "${YELLOW}   Type: A${NC}"
echo "   Name: @ (or ${DOMAIN})"
echo "   Value: ${SERVER_IP}"
echo "   TTL: 3600 (or lowest available)"
echo ""
echo -e "${YELLOW}   Type: CNAME${NC}"
echo "   Name: www"
echo "   Value: ${DOMAIN}"
echo "   TTL: 3600"
echo ""
echo -e "${CYAN}📋 Testing:${NC}"
echo ""
echo "Once DNS propagates (5-30 minutes), test with:"
echo "   curl http://${DOMAIN}"
echo "   curl http://www.${DOMAIN}"
echo ""
echo -e "${CYAN}🔒 SSL Setup (Recommended):${NC}"
echo ""
echo "After DNS is working, run:"
echo -e "${GREEN}   sudo ./scripts/setup-ssl.sh${NC}"
echo ""
echo -e "${CYAN}🔍 Troubleshooting:${NC}"
echo ""
echo "Check Nginx status: sudo systemctl status nginx"
echo "Check Nginx logs: sudo tail -f /var/log/nginx/error.log"
echo "Check if app is running: curl http://localhost:${APP_PORT}"
echo "Test DNS: nslookup ${DOMAIN}"
echo ""
echo -e "${YELLOW}⚠️ Important:${NC}"
echo "Make sure your application is running on port ${APP_PORT}"
echo "Currently it should be at: http://${SERVER_IP}:${APP_PORT}"