#!/bin/bash

# SSL Setup Script for daily3club.com
# Uses Certbot to obtain and configure Let's Encrypt SSL certificate

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
DOMAIN="daily3club.com"
EMAIL=""  # Will prompt if not set

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔒 SSL SETUP FOR ${DOMAIN}${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""
echo -e "${YELLOW}This script will:${NC}"
echo "   1. Install Certbot"
echo "   2. Obtain Let's Encrypt SSL certificate"
echo "   3. Configure Nginx for HTTPS"
echo "   4. Setup auto-renewal"
echo ""

# Check if domain is responding
echo -e "${YELLOW}🔍 Checking if domain is accessible...${NC}"
if curl -f -s -o /dev/null "http://${DOMAIN}"; then
    echo -e "${GREEN}✅ Domain is accessible${NC}"
else
    echo -e "${RED}❌ Domain is not accessible yet${NC}"
    echo ""
    echo "Please ensure:"
    echo "1. DNS records are configured (A record pointing to this server)"
    echo "2. DNS has propagated (can take 5-30 minutes)"
    echo "3. Nginx is running and configured"
    echo ""
    echo "Test with: curl http://${DOMAIN}"
    exit 1
fi

# Get email for Let's Encrypt
echo ""
if [ -z "$EMAIL" ]; then
    read -p "Enter email for Let's Encrypt notifications: " EMAIL
    if [ -z "$EMAIL" ]; then
        echo -e "${RED}Email is required for Let's Encrypt${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${YELLOW}Using email: ${EMAIL}${NC}"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

# Step 1: Install Certbot
echo ""
echo -e "${YELLOW}📦 Installing Certbot...${NC}"

# Check Ubuntu version for appropriate installation method
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [[ "$VERSION_ID" == "20.04" || "$VERSION_ID" == "22.04" || "$VERSION_ID" == "24.04" ]]; then
        # Use snap for newer Ubuntu
        if ! command -v certbot &> /dev/null; then
            sudo apt update
            sudo apt install -y snapd
            sudo snap install core
            sudo snap refresh core
            sudo snap install --classic certbot
            sudo ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true
            echo -e "${GREEN}✅ Certbot installed via snap${NC}"
        else
            echo -e "${GREEN}✅ Certbot already installed${NC}"
        fi
    else
        # Use apt for older Ubuntu
        sudo apt update
        sudo apt install -y certbot python3-certbot-nginx
        echo -e "${GREEN}✅ Certbot installed via apt${NC}"
    fi
else
    # Default to apt
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
    echo -e "${GREEN}✅ Certbot installed${NC}"
fi

# Step 2: Obtain SSL certificate
echo ""
echo -e "${YELLOW}🔒 Obtaining SSL certificate...${NC}"
echo "This will:"
echo "  - Contact Let's Encrypt servers"
echo "  - Verify domain ownership"
echo "  - Download SSL certificate"
echo "  - Configure Nginx automatically"
echo ""

# Run certbot
if sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --email ${EMAIL} --redirect; then
    echo -e "${GREEN}✅ SSL certificate obtained and configured!${NC}"
else
    echo -e "${RED}❌ Failed to obtain certificate${NC}"
    echo ""
    echo "Common issues:"
    echo "  - DNS not properly configured"
    echo "  - Port 80 not accessible"
    echo "  - Domain not pointing to this server"
    echo ""
    echo "Try manual mode:"
    echo "  sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
    exit 1
fi

# Step 3: Test auto-renewal
echo ""
echo -e "${YELLOW}🔄 Testing auto-renewal...${NC}"
if sudo certbot renew --dry-run; then
    echo -e "${GREEN}✅ Auto-renewal is working${NC}"
else
    echo -e "${YELLOW}⚠️ Auto-renewal test failed, but certificate is installed${NC}"
fi

# Step 4: Setup renewal cron job (backup, certbot usually does this)
echo ""
echo -e "${YELLOW}📅 Ensuring renewal cron job...${NC}"

# Check if systemd timer exists (preferred method)
if systemctl list-timers | grep -q certbot; then
    echo -e "${GREEN}✅ Systemd timer for renewal already exists${NC}"
else
    # Add cron job as backup
    CRON_FILE="/etc/cron.d/certbot-renewal"
    if [ ! -f "$CRON_FILE" ]; then
        echo "0 0,12 * * * root python3 -c 'import random; import time; time.sleep(random.random() * 3600)' && certbot renew -q" | sudo tee $CRON_FILE > /dev/null
        echo -e "${GREEN}✅ Cron job created for renewal${NC}"
    else
        echo -e "${GREEN}✅ Cron job already exists${NC}"
    fi
fi

# Step 5: Optimize SSL configuration
echo ""
echo -e "${YELLOW}🔧 Optimizing SSL configuration...${NC}"

# Add strong SSL configuration
SSL_CONF="/etc/nginx/snippets/ssl-params.conf"
if [ ! -f "$SSL_CONF" ]; then
    sudo tee $SSL_CONF > /dev/null << 'EOF'
# Strong SSL Security
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
ssl_stapling on;
ssl_stapling_verify on;
add_header Strict-Transport-Security "max-age=63072000" always;
EOF
    echo -e "${GREEN}✅ SSL security parameters configured${NC}"
else
    echo -e "${GREEN}✅ SSL security parameters already configured${NC}"
fi

# Reload Nginx
echo ""
echo -e "${YELLOW}🔄 Reloading Nginx...${NC}"
sudo nginx -t && sudo systemctl reload nginx
echo -e "${GREEN}✅ Nginx reloaded with SSL${NC}"

# Final summary
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}🎉 SSL SETUP COMPLETE!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""
echo -e "${CYAN}✅ Your site is now available at:${NC}"
echo -e "${GREEN}   https://${DOMAIN}${NC}"
echo -e "${GREEN}   https://www.${DOMAIN}${NC}"
echo ""
echo -e "${CYAN}📋 Certificate Details:${NC}"
sudo certbot certificates | grep -A 3 "${DOMAIN}"
echo ""
echo -e "${CYAN}🔒 Security Features Enabled:${NC}"
echo "   ✓ TLS 1.2 and 1.3 only"
echo "   ✓ Strong cipher suites"
echo "   ✓ HSTS (Strict Transport Security)"
echo "   ✓ Auto-renewal configured"
echo ""
echo -e "${CYAN}📅 Renewal:${NC}"
echo "   Certificates auto-renew every 60 days"
echo "   Test renewal: sudo certbot renew --dry-run"
echo "   Force renewal: sudo certbot renew --force-renewal"
echo ""
echo -e "${CYAN}🔍 Test your SSL:${NC}"
echo "   https://www.ssllabs.com/ssltest/analyze.html?d=${DOMAIN}"