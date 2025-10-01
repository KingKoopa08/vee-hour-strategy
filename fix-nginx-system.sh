#!/bin/bash

# Fix nginx system service configuration (non-Docker)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FIXING NGINX SYSTEM CONFIGURATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

NGINX_CONFIG="/etc/nginx/sites-available/daily3club-wss"

# Step 1: Verify nginx is a system service, not Docker
echo -e "${YELLOW}Checking nginx installation type...${NC}"
if systemctl status nginx >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Nginx is running as system service${NC}"
elif docker ps | grep -q nginx; then
    echo -e "${YELLOW}⚠️  Nginx appears to be running in Docker${NC}"
    echo -e "${YELLOW}Run fix-nginx-docker-hosts.sh instead${NC}"
    exit 1
else
    echo -e "${RED}❌ Nginx not found${NC}"
    exit 1
fi
echo ""

# Step 2: Check current configuration
echo -e "${YELLOW}📋 Current nginx configuration:${NC}"
if [ -f "$NGINX_CONFIG" ]; then
    echo -e "${GREEN}✅ Config file: $NGINX_CONFIG${NC}"
    echo ""
    echo -e "${YELLOW}Current proxy_pass directives:${NC}"
    grep "proxy_pass" "$NGINX_CONFIG"
else
    echo -e "${RED}❌ Config not found: $NGINX_CONFIG${NC}"
    exit 1
fi
echo ""

# Step 3: Verify the config has host.docker.internal
echo -e "${YELLOW}Checking if config needs fixing...${NC}"
if grep -q "host.docker.internal" "$NGINX_CONFIG"; then
    echo -e "${GREEN}✅ Config already uses host.docker.internal${NC}"
    NEEDS_FIX=false
elif grep -q "localhost:305" "$NGINX_CONFIG"; then
    echo -e "${YELLOW}⚠️  Config uses localhost, needs to be changed to 127.0.0.1${NC}"
    NEEDS_FIX=true
else
    echo -e "${GREEN}✅ Config looks correct${NC}"
    NEEDS_FIX=false
fi
echo ""

# Step 4: Fix if needed (change host.docker.internal to localhost for system nginx)
if [ "$NEEDS_FIX" = true ]; then
    echo -e "${YELLOW}📋 Backing up and fixing configuration...${NC}"
    sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d-%H%M%S)"

    # For system nginx, localhost should work fine
    # But let's make sure it's 127.0.0.1 to be explicit
    echo -e "${YELLOW}Ensuring localhost points to 127.0.0.1...${NC}"
    sudo sed -i 's|host.docker.internal|localhost|g' "$NGINX_CONFIG"
    echo -e "${GREEN}✅ Configuration updated${NC}"
    echo ""

    echo -e "${YELLOW}New configuration:${NC}"
    grep "proxy_pass" "$NGINX_CONFIG"
    echo ""
fi

# Step 5: Test nginx configuration
echo -e "${YELLOW}📋 Testing nginx configuration...${NC}"
if sudo nginx -t; then
    echo -e "${GREEN}✅ Nginx config test passed${NC}"
else
    echo -e "${RED}❌ Nginx config test failed${NC}"
    if [ "$NEEDS_FIX" = true ]; then
        echo -e "${YELLOW}Restoring backup...${NC}"
        sudo cp "${NGINX_CONFIG}.backup."* "$NGINX_CONFIG" 2>/dev/null || true
    fi
    exit 1
fi
echo ""

# Step 6: Reload nginx
echo -e "${YELLOW}📋 Reloading nginx...${NC}"
sudo systemctl reload nginx
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Nginx reloaded successfully${NC}"
else
    echo -e "${RED}❌ Failed to reload nginx${NC}"
    sudo systemctl status nginx --no-pager | head -20
    exit 1
fi
echo ""

# Verification
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 VERIFYING CONFIGURATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Check if ports are accessible
echo -e "${YELLOW}Checking if backend ports are accessible:${NC}"
echo -e "Testing port 3050 (HTTP)..."
if curl -s http://localhost:3050/api/gainers | head -c 100 | grep -q "symbol"; then
    echo -e "${GREEN}✅ Port 3050 accessible${NC}"
else
    echo -e "${RED}❌ Port 3050 not accessible${NC}"
fi

echo -e "Testing port 3051 (WebSocket)..."
if nc -zv localhost 3051 2>&1 | grep -q "succeeded\|open"; then
    echo -e "${GREEN}✅ Port 3051 accessible${NC}"
else
    echo -e "${RED}❌ Port 3051 not accessible${NC}"
fi
echo ""

# Check nginx status
echo -e "${YELLOW}Nginx service status:${NC}"
sudo systemctl status nginx --no-pager | head -10
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ CONFIGURATION COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo -e "  2. Open browser console (F12)"
echo -e "  3. Look for: ${GREEN}'Connected to WebSocket'${NC}"
echo -e "  4. Verify data updates every second"
echo ""
echo -e "${YELLOW}Monitor for client connections:${NC}"
echo -e "  ${CYAN}pm2 logs market-scanner | grep 'Client connected'${NC}"
echo ""
