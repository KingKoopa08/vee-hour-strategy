#!/bin/bash

# VPS Setup Commands - Run these on your VPS

echo "📦 Installing Node.js and npm on VPS..."
echo ""

# Install Node.js and npm (if not installed)
echo "1. Install Node.js 18.x:"
echo "curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
echo "sudo apt-get install -y nodejs"
echo ""

echo "2. Verify installation:"
echo "node --version"
echo "npm --version"
echo ""

echo "3. Install dependencies:"
echo "cd /opt/vee-hour-strategy"
echo "npm install"
echo ""

echo "4. Deploy with Docker:"
echo "docker stop premarket-strategy 2>/dev/null || true"
echo "docker rm premarket-strategy 2>/dev/null || true"
echo "docker build --no-cache -t premarket-strategy ."
echo "docker run -d --name premarket-strategy -p 3018:3018 --restart unless-stopped premarket-strategy"
echo "docker logs -f premarket-strategy"
echo ""

echo "=========================================="
echo "QUICK INSTALL (Copy and run on VPS):"
echo "=========================================="
cat << 'EOF'
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && \
sudo apt-get install -y nodejs && \
node --version && \
npm --version

# Then deploy
cd /opt/vee-hour-strategy && \
npm install && \
docker stop premarket-strategy 2>/dev/null || true && \
docker rm premarket-strategy 2>/dev/null || true && \
docker build --no-cache -t premarket-strategy . && \
docker run -d --name premarket-strategy -p 3018:3018 --restart unless-stopped premarket-strategy && \
docker logs -f premarket-strategy
EOF