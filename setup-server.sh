#!/bin/bash

# ============================================
# FIRST-TIME SERVER SETUP
# Run this ONCE on a fresh server
# Usage: ./setup-server.sh
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 PREMARKET SCANNER - SERVER SETUP${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Update system
echo -e "${YELLOW}📦 Updating system packages...${NC}"
apt update && apt upgrade -y

# Install all dependencies at once
echo -e "${YELLOW}📦 Installing required software...${NC}"
apt install -y curl git nginx ufw fail2ban

# Install Node.js 18
echo -e "${YELLOW}📦 Installing Node.js 18...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install PM2 globally
echo -e "${YELLOW}📦 Installing PM2...${NC}"
npm install -g pm2

# Setup firewall
echo -e "${YELLOW}🔒 Configuring firewall...${NC}"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 3050/tcp
ufw allow 3051/tcp
echo "y" | ufw enable

# Create app directory
echo -e "${YELLOW}📁 Creating application directory...${NC}"
mkdir -p /opt/premarket-scanner

# Setup PM2 to start on boot
echo -e "${YELLOW}⚙️ Configuring PM2 startup...${NC}"
pm2 startup systemd -u root --hp /root
pm2 save

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ SERVER SETUP COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Server is ready for deployment!${NC}"
echo -e "${YELLOW}Next step: Run the deployment script${NC}"
echo -e "${CYAN}./deploy-production.sh YOUR_SERVER_IP${NC}"