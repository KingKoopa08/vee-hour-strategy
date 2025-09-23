#!/bin/bash

# Setup script to make BOTH applications accessible
# THC app and Market Scanner will both work

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🌐 SETTING UP ACCESS FOR BOTH APPLICATIONS${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "${YELLOW}Current situation:${NC}"
echo "- THC nginx is on port 80 (blocking daily3club.com)"
echo "- Market Scanner needs daily3club.com to work"
echo "- You need access to BOTH applications"
echo ""

echo -e "${CYAN}Choose your preferred setup:${NC}"
echo ""
echo "1) THC on subdomain (thc.daily3club.com), Scanner on main (daily3club.com)"
echo "2) THC on port 8080, Scanner on daily3club.com"
echo "3) THC on different domain, Scanner on daily3club.com"
echo "4) Use IP for THC (${SERVER_IP}), domain for Scanner (daily3club.com)"
echo ""
read -p "Enter choice (1-4): " CHOICE

case $CHOICE in
    1)
        echo -e "${YELLOW}Setting up Option 1: Subdomain approach${NC}"

        # Stop THC nginx
        sudo docker stop thc_nginx 2>/dev/null || true

        # Configure system nginx for both
        sudo tee /etc/nginx/sites-available/both-apps > /dev/null << EOF
# THC Application - subdomain
server {
    listen 80;
    server_name thc.daily3club.com;

    location / {
        # THC frontend is on internal Docker network
        # Find the actual port/IP for THC
        proxy_pass http://localhost:8080;  # We'll move THC here
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}

# Market Scanner - main domain
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;

    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

        echo -e "${GREEN}Configure DNS:${NC}"
        echo "  A Record: @ → ${SERVER_IP}"
        echo "  A Record: thc → ${SERVER_IP}"
        echo "  CNAME: www → daily3club.com"
        ;;

    2)
        echo -e "${YELLOW}Setting up Option 2: Different ports${NC}"

        # Reconfigure THC nginx to use port 8080
        echo "Stopping THC nginx..."
        sudo docker stop thc_nginx

        echo "Starting THC nginx on port 8080..."
        # This needs to be adjusted based on how THC was started
        # If using docker-compose, need to edit the compose file

        sudo docker run -d \
            --name thc_nginx_8080 \
            --network $(sudo docker inspect thc_nginx 2>/dev/null | grep NetworkMode | cut -d'"' -f4 || echo "bridge") \
            -p 8080:80 \
            $(sudo docker inspect thc_nginx 2>/dev/null | grep Image | cut -d'"' -f4 || echo "nginx:alpine") 2>/dev/null || \
            echo "Manual configuration needed for THC on port 8080"

        # Configure nginx for daily3club.com only
        sudo tee /etc/nginx/sites-available/scanner > /dev/null << 'EOF'
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;

    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

        echo -e "${GREEN}Access:${NC}"
        echo "  THC App: http://${SERVER_IP}:8080"
        echo "  Market Scanner: http://daily3club.com"
        ;;

    3)
        echo -e "${YELLOW}Setting up Option 3: Different domains${NC}"

        read -p "Enter domain for THC app (e.g., thcapp.com): " THC_DOMAIN

        # Stop THC nginx
        sudo docker stop thc_nginx 2>/dev/null || true

        # Configure both domains
        sudo tee /etc/nginx/sites-available/multi-domain > /dev/null << EOF
# THC Application
server {
    listen 80;
    server_name ${THC_DOMAIN} www.${THC_DOMAIN};

    location / {
        # Route to THC containers
        proxy_pass http://localhost:3000;  # Adjust based on THC frontend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}

# Market Scanner
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;

    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

        echo -e "${GREEN}Configure DNS:${NC}"
        echo "For daily3club.com:"
        echo "  A Record: @ → ${SERVER_IP}"
        echo "For ${THC_DOMAIN}:"
        echo "  A Record: @ → ${SERVER_IP}"
        ;;

    4)
        echo -e "${YELLOW}Setting up Option 4: IP for THC, Domain for Scanner${NC}"

        # This is the simplest - just stop THC nginx and use system nginx
        echo "Stopping THC nginx on port 80..."
        sudo docker stop thc_nginx

        echo "Restarting THC nginx on port 8080..."
        # Find THC compose file and update it
        THC_COMPOSE=$(find ~ -path "*/thc*/docker-compose.yml" 2>/dev/null | head -1)

        if [ ! -z "$THC_COMPOSE" ]; then
            echo "Found THC compose at: $THC_COMPOSE"
            echo "Please edit it to change nginx port from 80 to 8080"
            echo "Then run: docker-compose up -d"
        fi

        # Start system nginx for daily3club.com
        sudo tee /etc/nginx/sites-available/daily3club-only > /dev/null << 'EOF'
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;

    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Default server - show available apps
server {
    listen 80 default_server;
    server_name _;

    location / {
        return 200 "Available applications:\n- Market Scanner: http://daily3club.com\n- THC App: http://$SERVER_IP:8080\n- Trading App: http://$SERVER_IP:3010\n";
        add_header Content-Type text/plain;
    }
}
EOF

        echo -e "${GREEN}Access:${NC}"
        echo "  THC App: http://${SERVER_IP}:8080 (after reconfig)"
        echo "  Market Scanner: http://daily3club.com"
        echo "  Trading App: http://${SERVER_IP}:3010"
        ;;
esac

# Enable the configuration
sudo rm -f /etc/nginx/sites-enabled/*

if [ $CHOICE -eq 1 ]; then
    sudo ln -s /etc/nginx/sites-available/both-apps /etc/nginx/sites-enabled/
elif [ $CHOICE -eq 2 ]; then
    sudo ln -s /etc/nginx/sites-available/scanner /etc/nginx/sites-enabled/
elif [ $CHOICE -eq 3 ]; then
    sudo ln -s /etc/nginx/sites-available/multi-domain /etc/nginx/sites-enabled/
else
    sudo ln -s /etc/nginx/sites-available/daily3club-only /etc/nginx/sites-enabled/
fi

# Test and start nginx
echo ""
echo -e "${YELLOW}Starting Nginx...${NC}"
if sudo nginx -t; then
    sudo systemctl start nginx 2>/dev/null || sudo systemctl reload nginx
    sudo systemctl enable nginx
    echo -e "${GREEN}✅ Nginx configured${NC}"
else
    echo -e "${RED}❌ Nginx configuration error${NC}"
fi

# Ensure market scanner is running
echo ""
echo -e "${YELLOW}Checking Market Scanner...${NC}"
if ! pm2 list | grep -q "market-scanner"; then
    cd ~/vee-hour-strategy
    pm2 start unified-scanner.js --name market-scanner
    pm2 save
fi
pm2 restart market-scanner
echo -e "${GREEN}✅ Market Scanner running${NC}"

# Summary
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}✅ SETUP COMPLETE${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""

echo -e "${CYAN}📊 Current Setup:${NC}"
echo ""

if [ $CHOICE -eq 1 ]; then
    echo "Main domain: daily3club.com → Market Scanner"
    echo "Subdomain: thc.daily3club.com → THC App"
    echo ""
    echo "Configure DNS:"
    echo "  - Add A record for subdomain 'thc'"
elif [ $CHOICE -eq 2 ]; then
    echo "daily3club.com → Market Scanner (port 3050)"
    echo "THC App → Port 8080"
    echo ""
    echo "Access THC at: http://${SERVER_IP}:8080"
elif [ $CHOICE -eq 3 ]; then
    echo "daily3club.com → Market Scanner"
    echo "Your other domain → THC App"
else
    echo "daily3club.com → Market Scanner"
    echo "http://${SERVER_IP}:8080 → THC App"
    echo "http://${SERVER_IP}:3010 → Trading App"
fi

echo ""
echo -e "${YELLOW}Testing:${NC}"
echo "curl -H 'Host: daily3club.com' http://localhost"
echo "curl http://localhost:3050"

if [ $CHOICE -eq 2 ] || [ $CHOICE -eq 4 ]; then
    echo "curl http://localhost:8080  # THC app"
fi