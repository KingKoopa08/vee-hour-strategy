#!/bin/bash

# ============================================
# ONE-LINE QUICK INSTALL
# The absolute simplest deployment
# Usage: curl -sSL https://your-repo/quick-install.sh | bash
# Or: ./quick-install.sh
# ============================================

# Quick install with minimal prompts
{
    echo "🚀 Installing PreMarket Scanner..."

    # Install dependencies
    apt update -qq
    apt install -y nodejs npm git nginx ufw >/dev/null 2>&1
    npm install -g pm2 >/dev/null 2>&1

    # Clone or copy app
    rm -rf /opt/premarket-scanner
    mkdir -p /opt/premarket-scanner
    cd /opt/premarket-scanner

    # Try to copy local files first
    if [ -d "/mnt/d/Cursor Ideas/PreMarket_Stratedy" ]; then
        cp -r "/mnt/d/Cursor Ideas/PreMarket_Stratedy"/* .
    else
        # Clone from git (update this URL)
        git clone https://github.com/yourusername/PreMarket_Strategy.git . || {
            echo "❌ Failed. Please update git URL in script"
            exit 1
        }
    fi

    # Setup environment
    cat > .env << EOF
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV
PORT=3050
WS_PORT=3051
NODE_ENV=production
EOF

    # Install and start
    npm install --production
    pm2 delete market-scanner 2>/dev/null
    pm2 start unified-scanner.js --name market-scanner
    pm2 save
    pm2 startup -u root --hp /root | tail -1 | bash

    # Setup nginx
    cat > /etc/nginx/sites-available/default << 'NGINX'
server {
    listen 80;
    server_name _;
    location / { proxy_pass http://localhost:3050; proxy_http_version 1.1; }
    location /ws { proxy_pass http://localhost:3051; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
}
NGINX

    systemctl reload nginx

    # Open firewall
    ufw allow 80/tcp >/dev/null 2>&1
    ufw allow 3050/tcp >/dev/null 2>&1
    ufw allow 3051/tcp >/dev/null 2>&1

    echo "✅ Installation complete!"
    echo "📊 Access at: http://$(hostname -I | awk '{print $1}'):3050"
    echo "📋 Logs: pm2 logs market-scanner"
}