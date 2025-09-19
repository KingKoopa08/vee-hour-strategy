#!/bin/bash

# Deploy Unified Scanner Script for daily3club.com
# This script pulls latest code and configures everything

set -e  # Exit on any error

echo "🚀 Deploying Unified Scanner to VPS"
echo "===================================="
echo ""

# Configuration
DOMAIN="daily3club.com"
VPS_IP="15.204.86.6"
APP_DIR="/opt/vee-hour-strategy"
EMAIL="admin@daily3club.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Step 1: Pull latest code from GitHub
echo ""
echo "📥 Step 1: Pulling latest code from GitHub..."
cd $APP_DIR

# Stash any local changes
git stash

# Pull latest code
git pull origin main

print_status "Latest code pulled"

# Step 2: Install/Update Node dependencies
echo ""
echo "📦 Step 2: Installing Node.js dependencies..."
npm install --production

print_status "Dependencies installed"

# Step 3: Stop old Docker container if needed
echo ""
echo "🐳 Step 3: Managing Docker containers..."

# Check if old premarket-strategy container is running
if docker ps | grep -q "premarket-strategy"; then
    print_warning "Stopping old premarket-strategy container..."
    docker stop premarket-strategy
    docker rm premarket-strategy
    print_status "Old container stopped"
fi

# Step 4: Check and stop any existing PM2 processes
echo ""
echo "🔧 Step 4: Managing PM2 processes..."

# Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    print_warning "Installing PM2..."
    npm install -g pm2
fi

# Stop any existing PM2 processes
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

print_status "PM2 cleaned up"

# Step 5: Create ecosystem.config.js if it doesn't exist
echo ""
echo "📝 Step 5: Creating PM2 configuration..."

cat > $APP_DIR/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'market-scanner',
    script: './unified-scanner.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3050,
      WS_PORT: 3051
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF

# Create logs directory
mkdir -p $APP_DIR/logs

print_status "PM2 configuration created"

# Step 6: Update WebSocket URLs in HTML files for production
echo ""
echo "🌐 Step 6: Updating WebSocket URLs for production..."

for file in volume-movers-page.html gainers-page.html rising-stocks-page.html; do
    if [ -f "$APP_DIR/$file" ]; then
        # Backup original
        cp "$APP_DIR/$file" "$APP_DIR/${file}.backup" 2>/dev/null || true

        # Update WebSocket connection to handle production
        sed -i "s|ws://localhost:3051|wss://daily3club.com/ws|g" "$file"
        sed -i "s|ws://' + wsHost + ':3051|' + (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + wsHost + (window.location.hostname === 'localhost' ? ':3051' : '/ws')|g" "$file"

        print_status "Updated $file"
    fi
done

# Step 7: Start the application with PM2
echo ""
echo "🚀 Step 7: Starting application with PM2..."

cd $APP_DIR
NODE_ENV=production pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root
pm2 save

print_status "Application started with PM2"

# Step 8: Configure Nginx
echo ""
echo "⚙️ Step 8: Configuring Nginx..."

# Install Nginx if not present
if ! command -v nginx &> /dev/null; then
    apt-get update -qq
    apt-get install -y nginx certbot python3-certbot-nginx -qq
fi

# Create Nginx configuration
cat > /etc/nginx/sites-available/daily3club.com << 'NGINX_EOF'
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;

    # Increase buffer sizes for WebSocket
    proxy_buffer_size 4k;
    proxy_buffers 8 4k;
    proxy_busy_buffers_size 16k;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    send_timeout 60s;

    # Main application
    location / {
        proxy_pass http://127.0.0.1:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket connection
    location /ws {
        proxy_pass http://127.0.0.1:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket specific
        proxy_read_timeout 86400;
    }

    # API endpoints
    location /api/ {
        proxy_pass http://127.0.0.1:3050/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_EOF

# Enable the site
ln -sf /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-enabled/

# Remove default site if exists
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Reload Nginx
systemctl reload nginx

print_status "Nginx configured and reloaded"

# Step 9: Setup SSL (if DNS is ready)
echo ""
echo "🔐 Step 9: Checking SSL setup..."

# Check if DNS is pointing to this server
DNS_IP=$(dig +short $DOMAIN @8.8.8.8 2>/dev/null)

if [ "$DNS_IP" = "$VPS_IP" ]; then
    print_status "DNS is correctly pointing to this server"

    # Check if SSL cert already exists
    if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        echo "Setting up SSL certificate..."
        certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email $EMAIL --redirect

        if [ $? -eq 0 ]; then
            print_status "SSL certificate installed"
        else
            print_warning "SSL setup failed - run certbot manually later"
        fi
    else
        print_status "SSL certificate already exists"
    fi
else
    print_warning "DNS not pointing to this server yet ($DNS_IP vs $VPS_IP)"
    echo "After DNS propagates, run: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# Step 10: Configure firewall
echo ""
echo "🔥 Step 10: Configuring firewall..."

ufw allow 22/tcp > /dev/null 2>&1  # SSH
ufw allow 80/tcp > /dev/null 2>&1  # HTTP
ufw allow 443/tcp > /dev/null 2>&1 # HTTPS
echo "y" | ufw enable > /dev/null 2>&1

print_status "Firewall configured"

# Step 11: Test the deployment
echo ""
echo "🧪 Step 11: Testing deployment..."

sleep 3

# Test main application
if curl -s http://localhost:3050 > /dev/null; then
    print_status "Application responding on port 3050"
else
    print_error "Application not responding on port 3050"
fi

# Test Nginx proxy
if curl -s http://localhost > /dev/null; then
    print_status "Nginx proxy working"
else
    print_error "Nginx proxy not working"
fi

# Final Summary
echo ""
echo "============================================"
echo "📊 Deployment Summary"
echo "============================================"
echo ""

# Check service status
echo "Service Status:"

if pm2 list | grep -q "online"; then
    print_status "PM2 Application: Running"
else
    print_error "PM2 Application: Not running"
fi

if systemctl is-active --quiet nginx; then
    print_status "Nginx: Running"
else
    print_error "Nginx: Not running"
fi

echo ""
echo "Access URLs:"
if [ "$DNS_IP" = "$VPS_IP" ]; then
    echo "  🌐 https://$DOMAIN"
    echo "  📈 https://$DOMAIN/gainers"
    echo "  📊 https://$DOMAIN/volume"
    echo "  📉 https://$DOMAIN/rising"
else
    echo "  🌐 http://$VPS_IP:3050"
    echo "  📈 http://$VPS_IP:3050/gainers"
    echo "  📊 http://$VPS_IP:3050/volume"
    echo "  📉 http://$VPS_IP:3050/rising"
fi

echo ""
echo "Useful Commands:"
echo "  View logs: pm2 logs market-scanner"
echo "  Monitor: pm2 monit"
echo "  Restart: pm2 restart market-scanner"
echo "  Status: pm2 status"
echo "  Nginx logs: tail -f /var/log/nginx/error.log"

echo ""
print_status "✨ Deployment complete!"
echo "============================================"