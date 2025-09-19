#!/bin/bash

# Docker Nginx Site Setup Script
# This script configures sites through the existing Docker nginx container
# Usage: ./setup-docker-nginx-site.sh

set -e  # Exit on any error

echo "🐳 Docker Nginx Site Configuration for daily3club.com"
echo "======================================================"
echo ""

# Configuration
DOMAIN="daily3club.com"
APP_PORT="3050"
WS_PORT="3051"
NGINX_CONTAINER="thc_nginx"  # Your existing nginx container name

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

# Step 1: Check if nginx container exists
echo "📦 Step 1: Checking Docker nginx container..."
if ! docker ps | grep -q "$NGINX_CONTAINER"; then
    print_error "Nginx container '$NGINX_CONTAINER' not found!"
    echo "Available containers:"
    docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
    exit 1
fi
print_status "Found nginx container: $NGINX_CONTAINER"

# Step 2: Get Docker host IP for container to reach host services
echo ""
echo "🔍 Step 2: Getting Docker network configuration..."

# Try multiple methods to get the correct IP
# Method 1: Docker bridge gateway (most common)
DOCKER_HOST_IP=$(docker network inspect bridge --format='{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || true)

# Method 2: If that fails, try host.docker.internal resolution
if [ -z "$DOCKER_HOST_IP" ]; then
    DOCKER_HOST_IP=$(docker run --rm alpine getent hosts host.docker.internal | cut -f1 -d' ' 2>/dev/null || true)
fi

# Method 3: If still no IP, use the host's docker0 interface
if [ -z "$DOCKER_HOST_IP" ]; then
    DOCKER_HOST_IP=$(ip -4 addr show docker0 | grep -oP '(?<=inet\s)\d+(\.\d+){3}' 2>/dev/null || true)
fi

# Method 4: Last resort - use localhost (works if container uses host network)
if [ -z "$DOCKER_HOST_IP" ]; then
    DOCKER_HOST_IP="172.17.0.1"  # Default Docker bridge gateway
    print_warning "Could not detect Docker host IP, using default: $DOCKER_HOST_IP"
else
    print_status "Docker host IP: $DOCKER_HOST_IP"
fi

# Step 3: Check if PM2 app is running
echo ""
echo "🔧 Step 3: Checking PM2 application status..."

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    PM2_STATUS=$(pm2 status --no-color 2>/dev/null | grep market-scanner || true)
    if echo "$PM2_STATUS" | grep -q "online"; then
        print_status "PM2 app 'market-scanner' is running"
    else
        print_warning "PM2 app 'market-scanner' not running, attempting to start..."
        cd /opt/vee-hour-strategy
        pm2 start ecosystem.config.js 2>/dev/null || true
    fi
else
    print_warning "PM2 not found, checking if app is running directly..."
fi

# Test if app is accessible
if curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT | grep -q "200\|302"; then
    print_status "Application is accessible on port $APP_PORT"
else
    print_error "Application not accessible on port $APP_PORT"
    echo "Please ensure your application is running on port $APP_PORT"
fi

# Step 4: Create nginx configuration
echo ""
echo "📝 Step 4: Creating nginx configuration..."

# Create temporary config file
cat > /tmp/${DOMAIN}.conf << EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Increase buffer sizes for better performance
    client_max_body_size 100M;
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
        proxy_pass http://${DOCKER_HOST_IP}:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://${DOCKER_HOST_IP}:${WS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket specific settings
        proxy_read_timeout 86400;
        proxy_buffering off;
    }

    # API endpoints (if different handling needed)
    location /api/ {
        proxy_pass http://${DOCKER_HOST_IP}:${APP_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static file caching (optional)
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        proxy_pass http://${DOCKER_HOST_IP}:${APP_PORT};
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

print_status "Configuration file created"

# Step 5: Copy configuration to Docker container
echo ""
echo "🐳 Step 5: Deploying configuration to nginx container..."

# Backup existing config if it exists
docker exec $NGINX_CONTAINER test -f /etc/nginx/conf.d/${DOMAIN}.conf && \
    docker exec $NGINX_CONTAINER cp /etc/nginx/conf.d/${DOMAIN}.conf /etc/nginx/conf.d/${DOMAIN}.conf.backup 2>/dev/null || true

# Copy new config
docker cp /tmp/${DOMAIN}.conf ${NGINX_CONTAINER}:/etc/nginx/conf.d/${DOMAIN}.conf

if [ $? -eq 0 ]; then
    print_status "Configuration copied to container"
else
    print_error "Failed to copy configuration to container"
    exit 1
fi

# Step 6: Test nginx configuration
echo ""
echo "🧪 Step 6: Testing nginx configuration..."

if docker exec $NGINX_CONTAINER nginx -t 2>/dev/null; then
    print_status "Nginx configuration is valid"
else
    print_error "Nginx configuration test failed!"
    docker exec $NGINX_CONTAINER nginx -t
    exit 1
fi

# Step 7: Reload nginx
echo ""
echo "🔄 Step 7: Reloading nginx..."

docker exec $NGINX_CONTAINER nginx -s reload

if [ $? -eq 0 ]; then
    print_status "Nginx reloaded successfully"
else
    print_error "Failed to reload nginx"
    exit 1
fi

# Step 8: Test the setup
echo ""
echo "🌐 Step 8: Testing website access..."

# Test with domain header
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: ${DOMAIN}" http://localhost)

if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "302" ]; then
    print_status "Website is accessible! Response code: $RESPONSE"
else
    print_warning "Website returned status code: $RESPONSE"
    echo "This might be normal if your app redirects or requires authentication"
fi

# Step 9: DNS reminder
echo ""
echo "📋 Step 9: DNS Configuration Reminder"
echo "======================================"

CURRENT_IP=$(curl -s ifconfig.me 2>/dev/null || echo "Could not detect")
echo "Your server IP: $CURRENT_IP"
echo ""
echo "Make sure your DNS records are configured:"
echo "  Type: A"
echo "  Name: @"
echo "  Value: $CURRENT_IP"
echo ""
echo "  Type: A"
echo "  Name: www"
echo "  Value: $CURRENT_IP"

# Check current DNS
echo ""
echo "Current DNS status:"
DNS_IP=$(dig +short ${DOMAIN} @8.8.8.8 2>/dev/null || echo "Not resolved")
if [ "$DNS_IP" = "$CURRENT_IP" ]; then
    print_status "DNS is correctly configured!"
else
    print_warning "DNS points to: $DNS_IP (Expected: $CURRENT_IP)"
    echo "Please update your DNS records and wait for propagation"
fi

# Step 10: Summary
echo ""
echo "============================================"
echo "📊 Configuration Summary"
echo "============================================"
echo ""
echo "Domain: ${DOMAIN}"
echo "App Port: ${APP_PORT}"
echo "WebSocket Port: ${WS_PORT}"
echo "Docker Host IP: ${DOCKER_HOST_IP}"
echo "Nginx Container: ${NGINX_CONTAINER}"
echo ""
echo "Test URLs:"
echo "  http://${DOMAIN}"
echo "  http://${DOMAIN}/gainers"
echo "  http://${DOMAIN}/volume"
echo "  http://${DOMAIN}/rising"
echo ""
echo "Useful Commands:"
echo "  View nginx logs: docker logs ${NGINX_CONTAINER}"
echo "  Reload nginx: docker exec ${NGINX_CONTAINER} nginx -s reload"
echo "  View app logs: pm2 logs market-scanner"
echo "  Check app status: pm2 status"
echo "  Test locally: curl -H 'Host: ${DOMAIN}' http://localhost"
echo ""
print_status "✨ Setup complete!"

# Optional: Setup SSL with Certbot
echo ""
echo "============================================"
echo "🔐 SSL Setup (Optional)"
echo "============================================"
echo ""
echo "To setup SSL with Let's Encrypt, run:"
echo "  docker exec -it ${NGINX_CONTAINER} certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
echo ""
echo "Or use this script to automate SSL setup:"
echo "  ./setup-docker-ssl.sh ${DOMAIN}"

# Clean up
rm -f /tmp/${DOMAIN}.conf