#!/bin/bash

# Complete Domain Setup Script for daily3club.com
# Run this on your VPS as root after git pull

set -e  # Exit on any error

echo "🌐 Setting up daily3club.com - Complete Setup"
echo "=============================================="
echo ""

# Configuration
DOMAIN="daily3club.com"
VPS_IP="15.204.86.6"
APP_DIR="/opt/vee-hour-strategy"
EMAIL="admin@daily3club.com"  # Change this to your email for SSL cert

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

# Step 1: Update system and install required packages
echo ""
echo "📦 Step 1: Installing required packages..."
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx ufw curl -qq

print_status "Packages installed"

# Step 2: Configure UFW Firewall
echo ""
echo "🔥 Step 2: Configuring firewall..."
ufw allow 22/tcp > /dev/null 2>&1 # SSH
ufw allow 80/tcp > /dev/null 2>&1 # HTTP
ufw allow 443/tcp > /dev/null 2>&1 # HTTPS
ufw allow 3050/tcp > /dev/null 2>&1 # App port (for direct access if needed)
ufw allow 3051/tcp > /dev/null 2>&1 # WebSocket port (for direct access if needed)
echo "y" | ufw enable > /dev/null 2>&1

print_status "Firewall configured"

# Step 3: Create Nginx configuration
echo ""
echo "⚙️ Step 3: Creating Nginx configuration..."

cat > /etc/nginx/sites-available/daily3club.com << 'EOF'
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

    # WebSocket connection with specific path
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
EOF

print_status "Nginx configuration created"

# Step 4: Enable the site and remove default
echo ""
echo "🔗 Step 4: Enabling site configuration..."
ln -sf /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t > /dev/null 2>&1
if [ $? -eq 0 ]; then
    print_status "Nginx configuration valid"
else
    print_error "Nginx configuration error!"
    nginx -t
    exit 1
fi

# Reload Nginx
systemctl reload nginx
print_status "Nginx reloaded"

# Step 5: Update Node.js application files for production WebSocket
echo ""
echo "📝 Step 5: Updating application files for production..."

cd $APP_DIR

# Update WebSocket URLs in HTML files
for file in volume-movers-page.html gainers-page.html rising-stocks-page.html; do
    if [ -f "$file" ]; then
        # Backup original
        cp "$file" "${file}.backup"

        # Update WebSocket connection logic
        sed -i "s|const wsUrl = 'ws://' + wsHost + ':3051';|const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; const wsPort = window.location.hostname === 'localhost' ? ':3051' : ''; const wsPath = window.location.hostname === 'localhost' ? '' : '/ws'; const wsUrl = wsProtocol + '//' + wsHost + wsPort + wsPath;|g" "$file"

        print_status "Updated $file"
    fi
done

# Step 6: Restart PM2 application
echo ""
echo "🔄 Step 6: Restarting application with PM2..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 not found, installing..."
    npm install -g pm2
fi

# Stop old process if exists
pm2 stop market-scanner 2>/dev/null || true
pm2 delete market-scanner 2>/dev/null || true

# Start with PM2
NODE_ENV=production pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root
pm2 save

print_status "Application restarted with PM2"

# Step 7: Test the application
echo ""
echo "🧪 Step 7: Testing application..."

sleep 3

# Test main application
if curl -s http://localhost:3050 > /dev/null; then
    print_status "Main application responding on port 3050"
else
    print_error "Main application not responding!"
fi

# Test through Nginx
if curl -s http://localhost > /dev/null; then
    print_status "Nginx proxy working"
else
    print_error "Nginx proxy not working!"
fi

# Step 8: Check DNS and setup SSL
echo ""
echo "🔍 Step 8: Checking DNS..."

# Check if DNS is pointing to this server
DNS_IP=$(dig +short $DOMAIN @8.8.8.8)

if [ "$DNS_IP" = "$VPS_IP" ]; then
    print_status "DNS is correctly pointing to this server ($VPS_IP)"

    echo ""
    echo "🔐 Step 9: Setting up SSL certificate..."

    # Setup SSL with Let's Encrypt
    certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email $EMAIL --redirect

    if [ $? -eq 0 ]; then
        print_status "SSL certificate installed successfully!"

        # Setup auto-renewal
        echo "0 0,12 * * * root certbot renew --quiet" > /etc/cron.d/certbot-renewal
        print_status "Auto-renewal configured"
    else
        print_warning "SSL setup failed - you may need to run certbot manually later"
    fi
else
    print_warning "DNS not pointing to this server yet"
    print_warning "Current DNS: $DNS_IP"
    print_warning "Expected: $VPS_IP"
    echo ""
    echo "Please update your DNS records:"
    echo "  Type: A"
    echo "  Name: @"
    echo "  Value: $VPS_IP"
    echo ""
    echo "After DNS propagates, run:"
    echo "  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
fi

# Step 9: Display summary
echo ""
echo "=============================================="
echo "📊 Setup Summary"
echo "=============================================="
echo ""

# Check service status
echo "Service Status:"
if systemctl is-active --quiet nginx; then
    print_status "Nginx: Running"
else
    print_error "Nginx: Not running"
fi

pm2_status=$(pm2 status --no-color | grep market-scanner | awk '{print $12}')
if [ "$pm2_status" = "online" ]; then
    print_status "Application: Running"
else
    print_error "Application: Not running"
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
echo "  Nginx logs: tail -f /var/log/nginx/error.log"

echo ""
print_status "Setup complete!"

# Final check
echo ""
echo "Testing final setup..."
if [ "$DNS_IP" = "$VPS_IP" ]; then
    if curl -s https://$DOMAIN > /dev/null 2>&1; then
        print_status "✨ Everything is working! Visit https://$DOMAIN"
    else
        print_warning "HTTPS not working yet, but HTTP should work"
    fi
fi

echo ""
echo "=============================================="
echo "🎉 Domain setup completed!"
echo "=============================================="