#!/bin/bash

# Nginx setup script for daily3club.com
echo "🌐 Setting up Nginx for daily3club.com"
echo "======================================="

cat << 'EOF'
# Run these commands on your VPS as root

# 1. Install Nginx if not already installed
apt update
apt install -y nginx certbot python3-certbot-nginx

# 2. Create Nginx configuration
cat > /etc/nginx/sites-available/daily3club.com << 'NGINX_CONFIG'
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;

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

    # WebSocket connection
    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_CONFIG

# 3. Enable the site
ln -sf /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default  # Remove default site

# 4. Test Nginx configuration
nginx -t

# 5. Reload Nginx
systemctl reload nginx

# 6. Setup SSL with Let's Encrypt (after DNS propagation)
echo ""
echo "⏳ Wait for DNS to propagate (5-30 minutes), then run:"
echo "certbot --nginx -d daily3club.com -d www.daily3club.com"

# 7. Setup auto-renewal
echo "0 0,12 * * * root certbot renew --quiet" > /etc/cron.d/certbot-renewal

echo ""
echo "✅ Nginx configuration complete!"
echo ""
echo "Next steps:"
echo "1. Update your DNS A record to point to: 15.204.86.6"
echo "2. Wait for DNS propagation (check with: nslookup daily3club.com)"
echo "3. Run certbot command above for SSL"
echo "4. Access your site at https://daily3club.com"
EOF