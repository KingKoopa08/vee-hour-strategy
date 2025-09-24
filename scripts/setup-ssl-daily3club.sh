#!/bin/bash

# SSL Setup Script specifically for daily3club.com
# This handles the case where THC nginx is on port 80

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🔒 SSL SETUP FOR daily3club.com${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Step 1: Check current port 80 situation
echo -e "${YELLOW}🔍 Checking what's on port 80...${NC}"
PORT_80_PROCESS=$(sudo lsof -i :80 2>/dev/null | grep LISTEN | awk '{print $1}' | head -1)

if [ "$PORT_80_PROCESS" = "docker-pr" ]; then
    echo -e "${RED}⚠️  Docker (THC nginx) is on port 80${NC}"
    echo ""
    echo "We need to handle SSL differently since Docker nginx is controlling port 80"
    echo ""
    echo -e "${CYAN}Choose SSL setup method:${NC}"
    echo "1) Add SSL to THC nginx container (Recommended)"
    echo "2) Stop THC nginx and use system nginx"
    echo "3) Use Cloudflare for SSL (if using Cloudflare DNS)"
    read -p "Enter choice (1-3): " SSL_CHOICE
else
    echo -e "${GREEN}✅ System nginx is on port 80${NC}"
    SSL_CHOICE=2
fi

# Get email for Let's Encrypt
echo ""
read -p "Enter email for Let's Encrypt notifications: " EMAIL
if [ -z "$EMAIL" ]; then
    echo -e "${RED}Email is required for Let's Encrypt${NC}"
    exit 1
fi

case $SSL_CHOICE in
    1)
        echo ""
        echo -e "${YELLOW}📦 Setting up SSL in Docker container...${NC}"

        # Create SSL setup for Docker
        cat > /tmp/docker-ssl-setup.sh << 'EOF'
#!/bin/bash

# This script runs INSIDE the Docker container

# Install certbot in container
apk add --no-cache certbot certbot-nginx

# Get certificate
certbot certonly --webroot \
    -w /usr/share/nginx/html \
    -d daily3club.com \
    -d www.daily3club.com \
    --non-interactive \
    --agree-tos \
    --email EMAIL_PLACEHOLDER

# Create SSL config
cat > /etc/nginx/conf.d/daily3club-ssl.conf << 'NGINX_EOF'
server {
    listen 443 ssl;
    server_name daily3club.com www.daily3club.com;

    ssl_certificate /etc/letsencrypt/live/daily3club.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/daily3club.com/privkey.pem;

    location / {
        proxy_pass http://host.docker.internal:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name daily3club.com www.daily3club.com;
    return 301 https://$server_name$request_uri;
}
NGINX_EOF

nginx -s reload
EOF

        # Replace email placeholder
        sed -i "s/EMAIL_PLACEHOLDER/$EMAIL/g" /tmp/docker-ssl-setup.sh

        # Copy script to container and execute
        echo -e "${YELLOW}Copying SSL setup to THC nginx container...${NC}"
        sudo docker cp /tmp/docker-ssl-setup.sh thc_nginx:/tmp/setup-ssl.sh
        sudo docker exec thc_nginx chmod +x /tmp/setup-ssl.sh

        echo -e "${YELLOW}Running SSL setup in container...${NC}"
        sudo docker exec -it thc_nginx /tmp/setup-ssl.sh

        echo -e "${GREEN}✅ SSL configured in Docker container${NC}"
        ;;

    2)
        echo ""
        echo -e "${YELLOW}🛑 Stopping Docker nginx to use system nginx...${NC}"

        # Stop THC nginx if running
        if sudo docker ps | grep -q thc_nginx; then
            sudo docker stop thc_nginx
            echo -e "${GREEN}✅ THC nginx stopped${NC}"
        fi

        # Install certbot
        echo ""
        echo -e "${YELLOW}📦 Installing Certbot...${NC}"

        if ! command -v certbot &> /dev/null; then
            sudo apt update
            sudo apt install -y certbot python3-certbot-nginx
            echo -e "${GREEN}✅ Certbot installed${NC}"
        else
            echo -e "${GREEN}✅ Certbot already installed${NC}"
        fi

        # Make sure nginx config exists
        if [ ! -f /etc/nginx/sites-available/daily3club.com ]; then
            echo -e "${YELLOW}Creating nginx config for daily3club.com...${NC}"

            sudo tee /etc/nginx/sites-available/daily3club.com > /dev/null << 'EOF'
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

    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

            sudo ln -sf /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-enabled/
            sudo rm -f /etc/nginx/sites-enabled/default
        fi

        # Start nginx if not running
        if ! systemctl is-active --quiet nginx; then
            sudo systemctl start nginx
            sudo systemctl enable nginx
        fi

        # Get SSL certificate
        echo ""
        echo -e "${YELLOW}🔒 Obtaining SSL certificate...${NC}"

        if sudo certbot --nginx \
            -d daily3club.com \
            -d www.daily3club.com \
            --non-interactive \
            --agree-tos \
            --email $EMAIL \
            --redirect; then
            echo -e "${GREEN}✅ SSL certificate obtained and configured!${NC}"
        else
            echo -e "${RED}❌ Failed to obtain certificate${NC}"
            echo "Trying standalone mode..."

            # Stop nginx temporarily
            sudo systemctl stop nginx

            # Try standalone
            if sudo certbot certonly --standalone \
                -d daily3club.com \
                -d www.daily3club.com \
                --non-interactive \
                --agree-tos \
                --email $EMAIL; then

                # Manually configure nginx for SSL
                sudo tee /etc/nginx/sites-available/daily3club.com > /dev/null << 'EOF'
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name daily3club.com www.daily3club.com;

    ssl_certificate /etc/letsencrypt/live/daily3club.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/daily3club.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

                sudo systemctl start nginx
                echo -e "${GREEN}✅ SSL configured manually${NC}"
            else
                echo -e "${RED}❌ Could not obtain certificate${NC}"
                sudo systemctl start nginx
                exit 1
            fi
        fi
        ;;

    3)
        echo ""
        echo -e "${CYAN}📋 Cloudflare SSL Setup${NC}"
        echo ""
        echo "1. Log into Cloudflare"
        echo "2. Go to SSL/TLS settings for daily3club.com"
        echo "3. Set SSL mode to 'Flexible' or 'Full'"
        echo "4. Enable 'Always Use HTTPS'"
        echo ""
        echo "Cloudflare will handle SSL termination"
        echo "Your server can continue using HTTP on port 80"
        ;;
esac

# Test auto-renewal
echo ""
echo -e "${YELLOW}🔄 Testing auto-renewal...${NC}"
if [ $SSL_CHOICE -ne 3 ]; then
    if sudo certbot renew --dry-run 2>/dev/null; then
        echo -e "${GREEN}✅ Auto-renewal is working${NC}"
    else
        echo -e "${YELLOW}⚠️ Auto-renewal test failed${NC}"
    fi
fi

# Summary
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}🎉 SSL SETUP COMPLETE!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""

echo -e "${CYAN}✅ Your site is now available at:${NC}"
echo -e "${GREEN}   https://daily3club.com${NC}"
echo -e "${GREEN}   https://www.daily3club.com${NC}"
echo ""

if [ $SSL_CHOICE -eq 1 ]; then
    echo -e "${YELLOW}Note: SSL is configured in Docker container${NC}"
    echo "To renew: docker exec thc_nginx certbot renew"
elif [ $SSL_CHOICE -eq 2 ]; then
    echo -e "${YELLOW}Note: THC nginx is stopped${NC}"
    echo "To access THC app, start it on different port"
fi

echo ""
echo -e "${CYAN}🔍 Test your SSL:${NC}"
echo "   https://www.ssllabs.com/ssltest/analyze.html?d=daily3club.com"
echo ""
echo -e "${CYAN}📅 Certificate renewal:${NC}"
echo "   Certificates auto-renew every 60 days"
echo "   Test renewal: sudo certbot renew --dry-run"
echo "   Force renewal: sudo certbot renew --force-renewal"