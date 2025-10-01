#!/bin/bash

# Fix Docker nginx WebSocket configuration
# The server runs nginx in Docker, not standalone

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FIXING DOCKER NGINX WEBSOCKET${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Step 1: Check what's in the active config
echo -e "${YELLOW}📋 Step 1/5: Checking current nginx config...${NC}"
ACTIVE_CONFIG="/etc/nginx/sites-available/daily3club-wss"

if [ -f "$ACTIVE_CONFIG" ]; then
    echo -e "${GREEN}✅ Found active config: $ACTIVE_CONFIG${NC}"
    echo ""
    echo -e "${YELLOW}Current WebSocket configuration:${NC}"
    grep -A 5 "location /ws" "$ACTIVE_CONFIG" || echo "No /ws location found"
else
    echo -e "${RED}❌ Config file not found${NC}"
    exit 1
fi
echo ""

# Step 2: Backup current config
echo -e "${YELLOW}📋 Step 2/5: Backing up current config...${NC}"
sudo cp "$ACTIVE_CONFIG" "${ACTIVE_CONFIG}.backup.$(date +%Y%m%d-%H%M%S)"
echo -e "${GREEN}✅ Backup created${NC}"
echo ""

# Step 3: Update the config with correct Docker host reference
echo -e "${YELLOW}📋 Step 3/5: Updating WebSocket proxy configuration...${NC}"

# Check if we need to update the upstream or location
if grep -q "server host.docker.internal:3051" "$ACTIVE_CONFIG"; then
    echo -e "${GREEN}✅ WebSocket already configured for Docker${NC}"
elif grep -q "server localhost:3051" "$ACTIVE_CONFIG"; then
    echo -e "${YELLOW}Updating localhost to host.docker.internal...${NC}"
    sudo sed -i 's/localhost:3051/host.docker.internal:3051/g' "$ACTIVE_CONFIG"
    echo -e "${GREEN}✅ Updated to host.docker.internal${NC}"
elif grep -q "location /ws" "$ACTIVE_CONFIG"; then
    echo -e "${YELLOW}WebSocket location exists, verifying proxy_pass...${NC}"
    grep "location /ws" -A 10 "$ACTIVE_CONFIG"
else
    echo -e "${RED}❌ No WebSocket location found in config${NC}"
    echo -e "${YELLOW}Please manually add this to $ACTIVE_CONFIG:${NC}"
    cat << 'EOF'

    # WebSocket endpoint
    location /ws {
        proxy_pass http://host.docker.internal:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;

        # No buffering
        proxy_buffering off;
    }
EOF
    exit 1
fi
echo ""

# Step 4: Test config
echo -e "${YELLOW}📋 Step 4/5: Testing nginx configuration...${NC}"
if sudo docker exec nginx nginx -t 2>/dev/null; then
    echo -e "${GREEN}✅ Config test passed (Docker nginx)${NC}"
elif sudo nginx -t 2>/dev/null; then
    echo -e "${GREEN}✅ Config test passed (System nginx)${NC}"
else
    echo -e "${RED}❌ Config test failed${NC}"
    exit 1
fi
echo ""

# Step 5: Reload nginx
echo -e "${YELLOW}📋 Step 5/5: Reloading nginx...${NC}"
if sudo docker exec nginx nginx -s reload 2>/dev/null; then
    echo -e "${GREEN}✅ Nginx reloaded (Docker)${NC}"
elif sudo systemctl reload nginx 2>/dev/null; then
    echo -e "${GREEN}✅ Nginx reloaded (System)${NC}"
else
    echo -e "${YELLOW}⚠️  Could not reload nginx${NC}"
    echo -e "${YELLOW}Trying to restart Docker container...${NC}"
    CONTAINER_ID=$(sudo docker ps | grep nginx | awk '{print $1}')
    if [ -n "$CONTAINER_ID" ]; then
        sudo docker restart "$CONTAINER_ID"
        echo -e "${GREEN}✅ Nginx container restarted${NC}"
    fi
fi
echo ""

# Step 6: Verify
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 VERIFYING CONFIGURATION${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

echo -e "${YELLOW}Checking if port 3051 is listening...${NC}"
if netstat -tlnp 2>/dev/null | grep :3051 || ss -tlnp | grep :3051; then
    echo -e "${GREEN}✅ Port 3051 is listening${NC}"
else
    echo -e "${RED}❌ Port 3051 not listening${NC}"
    echo -e "${YELLOW}Check market-scanner PM2 status:${NC}"
    pm2 list | grep market-scanner || echo "market-scanner not running"
fi
echo ""

echo -e "${YELLOW}Docker containers status:${NC}"
sudo docker ps | grep -E "nginx|CONTAINER"
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ DOCKER NGINX FIX COMPLETE!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${YELLOW}Next: Monitor for WebSocket connections${NC}"
echo -e "  ${CYAN}pm2 logs market-scanner${NC}"
echo -e "  Look for: ${GREEN}'👤 Client connected. Total: X'${NC}"
echo ""
echo -e "${YELLOW}Test the site:${NC}"
echo -e "  ${CYAN}https://daily3club.com/volume${NC}"
echo -e "  Open browser console and look for: ${GREEN}'Connected to WebSocket'${NC}"
echo ""
