#!/bin/bash

# Quick Deploy Script for VPS
# This script automates the entire deployment process

echo "🚀 QUICK DEPLOY - ROCKET SCANNER"
echo "================================="
echo ""

# Configuration
VPS_IP="15.204.86.6"
VPS_USER="root"
PROJECT_PATH="/opt/vee-hour-strategy"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📍 Deploying to: ${VPS_USER}@${VPS_IP}${NC}"
echo -e "${YELLOW}📂 Project path: ${PROJECT_PATH}${NC}"
echo ""

# Check if we're on the VPS or local
if [ -d "$PROJECT_PATH" ]; then
    echo -e "${GREEN}✅ Running on VPS - Starting deployment...${NC}"
    echo ""
    
    # Navigate to project directory
    cd $PROJECT_PATH || exit
    
    echo -e "${YELLOW}1️⃣ Pulling latest code from GitHub...${NC}"
    git pull origin main
    
    echo -e "${YELLOW}2️⃣ Installing Node.js (if needed)...${NC}"
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
        echo -e "${GREEN}✅ Node.js installed${NC}"
    else
        echo -e "${GREEN}✅ Node.js already installed ($(node --version))${NC}"
    fi
    
    echo -e "${YELLOW}3️⃣ Installing dependencies...${NC}"
    npm install
    
    echo -e "${YELLOW}4️⃣ Stopping old container...${NC}"
    docker stop premarket-strategy 2>/dev/null || true
    docker rm premarket-strategy 2>/dev/null || true
    
    echo -e "${YELLOW}5️⃣ Building new Docker image...${NC}"
    docker build --no-cache -t premarket-strategy .
    
    echo -e "${YELLOW}6️⃣ Starting new container...${NC}"
    docker run -d \
        --name premarket-strategy \
        -p 3018:3018 \
        --restart unless-stopped \
        premarket-strategy
    
    echo -e "${YELLOW}7️⃣ Checking container status...${NC}"
    sleep 3
    if docker ps | grep -q premarket-strategy; then
        echo -e "${GREEN}✅ Container running successfully!${NC}"
        echo ""
        echo -e "${GREEN}📊 Container logs:${NC}"
        docker logs --tail 20 premarket-strategy
    else
        echo -e "${RED}❌ Container failed to start!${NC}"
        echo -e "${RED}Error logs:${NC}"
        docker logs premarket-strategy
        exit 1
    fi
    
    echo ""
    echo -e "${GREEN}✨ DEPLOYMENT COMPLETE!${NC}"
    echo ""
    echo "📱 Access URLs:"
    echo "  Main: http://${VPS_IP}:3018"
    echo "  Rocket Scanner: http://${VPS_IP}:3018/rocket-scanner.html"
    echo "  Pre-Market: http://${VPS_IP}:3018/premarket-dashboard.html"
    echo "  Admin Panel: http://${VPS_IP}:3018/admin.html"
    echo ""
    echo "📊 Monitor logs with: docker logs -f premarket-strategy"
    
else
    echo -e "${YELLOW}📋 You're on local machine. Copy this command to run on VPS:${NC}"
    echo ""
    echo "ssh ${VPS_USER}@${VPS_IP} 'bash -s' << 'EOF'"
    cat << 'REMOTE_SCRIPT'
cd /opt/vee-hour-strategy

# Pull latest code
git pull origin main

# Install Node if needed
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# Install dependencies
npm install

# Rebuild and restart Docker
docker stop premarket-strategy 2>/dev/null || true
docker rm premarket-strategy 2>/dev/null || true
docker build --no-cache -t premarket-strategy .
docker run -d --name premarket-strategy -p 3018:3018 --restart unless-stopped premarket-strategy

# Show status
sleep 3
echo ""
echo "==================================="
if docker ps | grep -q premarket-strategy; then
    echo "✅ DEPLOYMENT SUCCESSFUL!"
    echo "==================================="
    echo ""
    echo "📱 Access at:"
    echo "  http://15.204.86.6:3018/rocket-scanner.html"
    echo ""
    docker logs --tail 10 premarket-strategy
else
    echo "❌ DEPLOYMENT FAILED!"
    echo "==================================="
    docker logs premarket-strategy
fi
REMOTE_SCRIPT
    echo "EOF"
    echo ""
    echo -e "${YELLOW}Or save this script on the VPS and run it:${NC}"
    echo "1. Copy this file to VPS: scp quick-deploy.sh ${VPS_USER}@${VPS_IP}:${PROJECT_PATH}/"
    echo "2. SSH to VPS: ssh ${VPS_USER}@${VPS_IP}"
    echo "3. Run script: cd ${PROJECT_PATH} && chmod +x quick-deploy.sh && ./quick-deploy.sh"
fi