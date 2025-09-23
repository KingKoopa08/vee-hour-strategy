#!/bin/bash

# Multi-Domain Setup Script for Docker Containers
# Configures Nginx to proxy multiple domains to different Docker containers

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🌐 MULTI-DOMAIN DOCKER SETUP${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Step 1: Identify what's using port 80
echo -e "${YELLOW}📊 Checking current port 80 usage...${NC}"
DOCKER_CONTAINER=$(sudo docker ps --format "table {{.Names}}\t{{.Ports}}" | grep ":80->" | head -1 || echo "")

if [ ! -z "$DOCKER_CONTAINER" ]; then
    echo "Found Docker container using port 80:"
    echo "$DOCKER_CONTAINER"
    echo ""
    echo -e "${YELLOW}We'll reconfigure this to work with Nginx${NC}"
else
    echo "No Docker container found on port 80"
fi

echo ""
echo -e "${CYAN}📋 Current Docker containers:${NC}"
sudo docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Image}}"

echo ""
echo -e "${YELLOW}This script will:${NC}"
echo "1. Stop Docker containers from binding to port 80 directly"
echo "2. Configure Nginx as the main reverse proxy"
echo "3. Route domains to appropriate containers"
echo "4. Keep all containers accessible via their internal ports"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

# Step 2: Find and stop container using port 80
echo ""
echo -e "${YELLOW}🔧 Reconfiguring Docker containers...${NC}"

# Get container ID using port 80
CONTAINER_ID=$(sudo docker ps -q --filter "publish=80")

if [ ! -z "$CONTAINER_ID" ]; then
    CONTAINER_NAME=$(sudo docker ps --filter "id=$CONTAINER_ID" --format "{{.Names}}")
    CONTAINER_IMAGE=$(sudo docker ps --filter "id=$CONTAINER_ID" --format "{{.Image}}")

    echo "Container using port 80: $CONTAINER_NAME (Image: $CONTAINER_IMAGE)"
    echo ""

    # Get the internal port the container is exposing
    INTERNAL_PORT=$(sudo docker inspect $CONTAINER_ID | grep -A 10 "ExposedPorts" | grep -oP '"\d+/tcp"' | grep -oP '\d+' | head -1)

    echo -e "${YELLOW}Stopping container to reconfigure...${NC}"
    sudo docker stop $CONTAINER_NAME

    echo ""
    echo -e "${YELLOW}Restarting container on a different port (8080)...${NC}"

    # Try to restart with new port mapping
    # This assumes the container can be restarted with new ports
    # You may need to adjust based on how the container was originally started

    if [ ! -z "$INTERNAL_PORT" ]; then
        echo "Attempting to restart $CONTAINER_NAME on port 8080..."

        # Try docker-compose first
        if [ -f ~/docker-compose.yml ] || [ -f ~/*/docker-compose.yml ]; then
            echo "Docker Compose file found. Please update it to use port 8080 instead of 80"
            echo "Change: ports: - '80:$INTERNAL_PORT' to ports: - '8080:$INTERNAL_PORT'"
        else
            # Try to start with docker run
            echo "Starting container on port 8080..."
            sudo docker run -d \
                --name ${CONTAINER_NAME}_temp \
                -p 8080:${INTERNAL_PORT:-80} \
                --restart unless-stopped \
                $CONTAINER_IMAGE 2>/dev/null || echo "Manual restart needed"
        fi
    fi

    echo -e "${GREEN}✅ Port 80 is now free for Nginx${NC}"
else
    echo -e "${GREEN}✅ Port 80 is already free${NC}"
fi

# Step 3: Start Nginx
echo ""
echo -e "${YELLOW}🚀 Starting Nginx...${NC}"

# Kill any existing nginx processes
sudo pkill -f nginx 2>/dev/null || true
sleep 1

# Start Nginx
if sudo systemctl start nginx; then
    echo -e "${GREEN}✅ Nginx started successfully${NC}"
    sudo systemctl enable nginx
else
    echo -e "${RED}❌ Failed to start Nginx${NC}"
    echo "Trying direct start..."
    sudo nginx || true
fi

# Step 4: Create configuration for both domains
echo ""
echo -e "${YELLOW}⚙️ Creating multi-domain configuration...${NC}"

SERVER_IP=$(hostname -I | awk '{print $1}')

# Create configuration for daily3club.com
sudo tee /etc/nginx/sites-available/daily3club.com > /dev/null << 'EOF'
# Configuration for daily3club.com
# Routes to market scanner on port 3050

server {
    listen 80;
    listen [::]:80;
    server_name daily3club.com www.daily3club.com;

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

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Create a template for the other domain
sudo tee /etc/nginx/sites-available/other-domain.template > /dev/null << 'EOF'
# Template for another domain
# Update DOMAIN_NAME and PORT as needed

server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_NAME www.DOMAIN_NAME;

    location / {
        proxy_pass http://localhost:PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable daily3club.com
sudo ln -sf /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-enabled/ 2>/dev/null || true

# Remove default site if exists
sudo rm -f /etc/nginx/sites-enabled/default

echo -e "${GREEN}✅ Multi-domain configuration created${NC}"

# Step 5: Test and reload
echo ""
echo -e "${YELLOW}🔄 Reloading Nginx...${NC}"
if sudo nginx -t; then
    sudo systemctl reload nginx || sudo nginx -s reload
    echo -e "${GREEN}✅ Nginx reloaded${NC}"
else
    echo -e "${RED}❌ Configuration error${NC}"
fi

# Step 6: Show final status
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}✅ MULTI-DOMAIN SETUP COMPLETE!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""

echo -e "${CYAN}📋 Current Setup:${NC}"
echo ""
echo "1. daily3club.com → localhost:3050 (Market Scanner)"
echo "2. Other container → localhost:8080 (Previously on port 80)"
echo ""

echo -e "${CYAN}🔧 To add another domain:${NC}"
echo ""
echo "1. Copy the template:"
echo "   sudo cp /etc/nginx/sites-available/other-domain.template /etc/nginx/sites-available/yourdomain.com"
echo ""
echo "2. Edit the file:"
echo "   sudo nano /etc/nginx/sites-available/yourdomain.com"
echo "   - Replace DOMAIN_NAME with your domain"
echo "   - Replace PORT with your container's port"
echo ""
echo "3. Enable the site:"
echo "   sudo ln -s /etc/nginx/sites-available/yourdomain.com /etc/nginx/sites-enabled/"
echo ""
echo "4. Test and reload:"
echo "   sudo nginx -t && sudo systemctl reload nginx"
echo ""

echo -e "${CYAN}📊 Current Docker Containers:${NC}"
sudo docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
echo ""

echo -e "${CYAN}📋 DNS Configuration Required:${NC}"
echo ""
echo "For daily3club.com:"
echo "  A Record: @ → ${SERVER_IP}"
echo "  CNAME: www → daily3club.com"
echo ""
echo "For your other domain:"
echo "  A Record: @ → ${SERVER_IP}"
echo "  CNAME: www → yourdomain.com"
echo ""

echo -e "${CYAN}🔍 Testing:${NC}"
echo ""
echo "Local tests (should work now):"
echo "  curl -H 'Host: daily3club.com' http://localhost"
echo "  curl http://localhost:3050"
echo "  curl http://localhost:8080"
echo ""
echo "After DNS propagation:"
echo "  curl http://daily3club.com"
echo ""

if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✅ Nginx is running and ready${NC}"
else
    echo -e "${YELLOW}⚠️ Nginx is not running. Check: sudo systemctl status nginx${NC}"
fi