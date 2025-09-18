#!/bin/bash

# VPS Setup Commands for Market Scanner
# Run these on your VPS

echo "📋 Market Scanner VPS Setup"
echo "=========================="

# 1. Pull latest changes
echo "1. Pulling latest changes..."
cd /opt/vee-hour-strategy
git pull

# 2. Check if PM2 process exists
echo ""
echo "2. Checking PM2 processes..."
pm2 list

# 3. Stop and delete old process if exists
echo ""
echo "3. Stopping old processes..."
pm2 stop market-scanner 2>/dev/null || true
pm2 delete market-scanner 2>/dev/null || true

# 4. Install dependencies
echo ""
echo "4. Installing dependencies..."
npm install

# 5. Setup environment file if needed
echo ""
echo "5. Checking .env file..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠️  Please edit .env file and add your POLYGON_API_KEY"
    echo "Run: nano .env"
    exit 1
fi

# 6. Start with PM2
echo ""
echo "6. Starting unified scanner..."
NODE_ENV=production pm2 start ecosystem.config.js

# 7. Save PM2 config
pm2 save

# 8. Check firewall
echo ""
echo "7. Checking firewall rules..."
sudo ufw status | grep 3050 || echo "⚠️  Port 3050 might not be open"
sudo ufw status | grep 3051 || echo "⚠️  Port 3051 might not be open"

# 9. Open ports if needed
echo ""
echo "8. Opening ports if needed..."
read -p "Do you want to open ports 3050 and 3051? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo ufw allow 3050/tcp
    sudo ufw allow 3051/tcp
    sudo ufw reload
    echo "✅ Ports opened"
fi

# 10. Test local connection
echo ""
echo "9. Testing local connection..."
sleep 3
curl -s http://localhost:3050 > /dev/null && echo "✅ Server responding on localhost:3050" || echo "❌ Server not responding"

# 11. Show logs
echo ""
echo "10. Recent logs:"
pm2 logs market-scanner --lines 20

echo ""
echo "=========================="
echo "✅ Setup complete!"
echo ""
echo "Access URLs:"
echo "  Main: http://15.204.86.6:3050"
echo "  Gainers: http://15.204.86.6:3050/gainers"
echo "  Rising: http://15.204.86.6:3050/rising"
echo ""
echo "Commands:"
echo "  View logs: pm2 logs market-scanner"
echo "  Monitor: pm2 monit"
echo "  Restart: pm2 restart market-scanner"
echo ""
echo "If site doesn't load, check:"
echo "  1. PM2 status: pm2 status"
echo "  2. Firewall: sudo ufw status"
echo "  3. Logs: pm2 logs market-scanner"