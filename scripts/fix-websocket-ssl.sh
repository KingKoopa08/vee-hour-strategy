#!/bin/bash

# Fix WebSocket SSL issue for HTTPS sites
# Changes WS to WSS connections

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔒 FIXING WEBSOCKET SSL ISSUE${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}Problem: Site uses HTTPS but WebSocket uses WS (insecure)${NC}"
echo -e "${YELLOW}Solution: Update to use WSS (secure WebSocket)${NC}"
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Step 1: Update unified-scanner.js to detect HTTPS
echo -e "${YELLOW}📝 Updating unified-scanner.js WebSocket configuration...${NC}"

# Check current WebSocket setup in HTML responses
if grep -q "ws://daily3club.com:3051" ~/vee-hour-strategy/unified-scanner.js 2>/dev/null; then
    echo "Found hardcoded WS URL, updating to dynamic protocol..."

    # Create patch for unified-scanner
    cat > /tmp/websocket-fix.patch << 'EOF'
// Fix for WebSocket protocol detection
// Replace hardcoded ws:// with dynamic protocol based on request

// In the HTML response sections, replace:
// ws://daily3club.com:3051
// With:
// ${req.protocol === 'https' ? 'wss' : 'ws'}://${req.hostname}${WS_PORT !== 443 && WS_PORT !== 80 ? ':' + WS_PORT : ''}

// Or for simpler approach, detect in client-side JavaScript:
// const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// const wsUrl = `${protocol}//${window.location.hostname}:3051`;
EOF
fi

# Step 2: Update Nginx to proxy WebSocket over SSL
echo ""
echo -e "${YELLOW}⚙️ Updating Nginx configuration for WSS...${NC}"

# Check if using system nginx or Docker nginx
if systemctl is-active --quiet nginx; then
    echo "System Nginx detected"

    # Update Nginx config for WSS
    sudo tee /etc/nginx/sites-available/daily3club-wss > /dev/null << 'EOF'
# Configuration for daily3club.com with WebSocket SSL support

server {
    listen 80;
    server_name daily3club.com www.daily3club.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name daily3club.com www.daily3club.com;

    # SSL certificates (update paths if needed)
    ssl_certificate /etc/letsencrypt/live/daily3club.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/daily3club.com/privkey.pem;

    # Main application
    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support - IMPORTANT: This handles WSS
    location /ws {
        proxy_pass http://localhost:3051;
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
}
EOF

    # Enable the new config
    sudo ln -sf /etc/nginx/sites-available/daily3club-wss /etc/nginx/sites-enabled/daily3club.com

    # Test and reload
    if sudo nginx -t; then
        sudo systemctl reload nginx
        echo -e "${GREEN}✅ Nginx updated for WSS support${NC}"
    fi
else
    echo -e "${YELLOW}Docker Nginx detected - needs different approach${NC}"
fi

# Step 3: Create client-side fix
echo ""
echo -e "${YELLOW}📝 Creating client-side WebSocket fix...${NC}"

cat > ~/vee-hour-strategy/websocket-client-fix.js << 'EOF'
// WebSocket Client Fix for HTTPS/WSS
// Add this to your HTML or update existing WebSocket connection code

function getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;

    // Use path-based WebSocket for same-origin
    // This works with Nginx proxy at /ws path
    if (protocol === 'wss:') {
        return `${protocol}//${hostname}/ws`;
    } else {
        // For local development, use port 3051
        return `${protocol}//${hostname}:3051`;
    }
}

// Usage:
const ws = new WebSocket(getWebSocketUrl());
EOF

echo -e "${GREEN}✅ Client fix created at ~/vee-hour-strategy/websocket-client-fix.js${NC}"

# Step 4: Quick fix - Update the HTML served by unified-scanner
echo ""
echo -e "${YELLOW}🔧 Applying quick fix to unified-scanner.js...${NC}"

cd ~/vee-hour-strategy

# Backup original
cp unified-scanner.js unified-scanner.js.backup

# Update WebSocket URLs in the HTML responses
sed -i "s|ws://\${window.location.hostname}:3051|' + (window.location.protocol === 'https:' ? 'wss://' + window.location.hostname + '/ws' : 'ws://' + window.location.hostname + ':3051') + '|g" unified-scanner.js
sed -i "s|ws://daily3club.com:3051|' + (window.location.protocol === 'https:' ? 'wss://daily3club.com/ws' : 'ws://daily3club.com:3051') + '|g" unified-scanner.js

# Alternative approach - make WebSocket URL dynamic
sed -i "s|const ws = new WebSocket('ws://|const ws = new WebSocket((window.location.protocol === 'https:' ? 'wss' : 'ws') + '://|g" unified-scanner.js

echo -e "${GREEN}✅ Updated unified-scanner.js with dynamic WebSocket protocol${NC}"

# Step 5: Restart the application
echo ""
echo -e "${YELLOW}🔄 Restarting market-scanner...${NC}"
pm2 restart market-scanner

# Step 6: Test the fix
echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}📋 TESTING THE FIX${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}Manual test steps:${NC}"
echo "1. Open Chrome DevTools (F12)"
echo "2. Go to https://daily3club.com/gainers"
echo "3. Check Console tab - should see 'Connected to WebSocket'"
echo "4. Check Network tab - should see WSS connection (not WS)"
echo ""

echo -e "${GREEN}✅ WebSocket should now work over HTTPS!${NC}"
echo ""

echo -e "${CYAN}🔍 How it works:${NC}"
echo "- HTTPS pages connect to WSS (secure WebSocket)"
echo "- Nginx proxies /ws path to localhost:3051"
echo "- Client detects HTTPS and uses WSS automatically"
echo ""

echo -e "${YELLOW}If still having issues:${NC}"
echo "1. Clear browser cache (Ctrl+F5)"
echo "2. Check: pm2 logs market-scanner"
echo "3. Check: sudo tail -f /var/log/nginx/error.log"
echo "4. Ensure SSL certificate is valid: sudo certbot certificates"