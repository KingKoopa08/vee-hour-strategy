# Production Deployment Guide

## Prerequisites
- VPS/Server with Ubuntu 20.04+ or similar Linux distribution
- Node.js 16+ installed
- PM2 process manager installed
- Git installed
- Domain name (optional, for web access)

## Step 1: Connect to Your Server
```bash
ssh your-user@your-server-ip
```

## Step 2: Clone the Repository
```bash
cd ~
git clone https://github.com/KingKoopa08/vee-hour-strategy.git
cd vee-hour-strategy
```

## Step 3: Install Dependencies
```bash
npm install
```

## Step 4: Configure Environment Variables
Create a `.env` file with your Polygon API key:

```bash
nano .env
```

Add the following:
```env
# Polygon API Configuration
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Optional: Discord Webhook for alerts
DISCORD_WEBHOOK=your_discord_webhook_url_here
```

Save and exit (Ctrl+X, Y, Enter)

## Step 5: Install PM2 (if not already installed)
```bash
npm install -g pm2
```

## Step 6: Start Services with PM2

### Option A: Start Individual Services
```bash
# Start the unified scanner
pm2 start unified-scanner.js --name "market-scanner"

# Start the premarket server
pm2 start premarket-server.js --name "premarket-server"

# Start spike detector (optional)
pm2 start spike-detector-rest.js --name "spike-detector"
```

### Option B: Use Ecosystem File
Create `ecosystem.config.js` (already exists in repo):
```bash
pm2 start ecosystem.config.js
```

## Step 7: Configure PM2 to Start on Boot
```bash
pm2 startup
# Follow the instructions provided by PM2

pm2 save
```

## Step 8: Configure Firewall (if needed)
```bash
# Allow SSH
sudo ufw allow 22

# Allow scanner ports
sudo ufw allow 3050
sudo ufw allow 3051
sudo ufw allow 3000

# Enable firewall
sudo ufw enable
```

## Step 9: Set Up Nginx Reverse Proxy (Optional)
If you want to access via domain name:

```bash
sudo apt update
sudo apt install nginx

sudo nano /etc/nginx/sites-available/market-scanner
```

Add configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

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
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/market-scanner /etc/nginx/sites-enabled
sudo nginx -t
sudo systemctl restart nginx
```

## Step 10: Monitor Services

### View logs:
```bash
# View all PM2 processes
pm2 list

# View specific service logs
pm2 logs market-scanner
pm2 logs premarket-server

# Monitor resources
pm2 monit
```

### Check service status:
```bash
# Check if services are running
curl http://localhost:3050/api/gainers
```

## Step 11: Update Deployment

To update the application with latest code:

```bash
cd ~/vee-hour-strategy
git pull origin main
npm install
pm2 restart all
```

## Service Endpoints

Once deployed, your services will be available at:

- **Main Scanner**: http://your-server:3050
- **WebSocket**: ws://your-server:3051
- **API Endpoints**:
  - GET /api/gainers - Top gaining stocks
  - GET /api/volume - Volume movers
  - GET /api/spikes - Detected spikes
  - GET /api/rising - Rising stocks

## Troubleshooting

### If services crash:
```bash
# Check logs
pm2 logs --lines 100

# Restart services
pm2 restart all
```

### If API key issues:
```bash
# Verify .env file
cat .env

# Test API key
node test-new-api-key.js
```

### Memory issues:
```bash
# Increase Node.js memory
pm2 start unified-scanner.js --node-args="--max-old-space-size=2048"
```

## Security Recommendations

1. **Never commit .env file** - It's already in .gitignore
2. **Use environment variables** on production server
3. **Set up SSL certificate** with Let's Encrypt:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```
4. **Regular updates**:
   ```bash
   sudo apt update && sudo apt upgrade
   npm audit fix
   ```

## Quick Setup Script

Save this as `deploy.sh` on your server:

```bash
#!/bin/bash

# Update system
sudo apt update

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone repository
cd ~
git clone https://github.com/KingKoopa08/vee-hour-strategy.git
cd vee-hour-strategy

# Install dependencies
npm install

# Create .env file
echo "Creating .env file..."
cat > .env << EOF
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV
PORT=3050
WS_PORT=3051
EOF

# Start services
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup

echo "Deployment complete! Services running on ports 3050 and 3051"
```

Make it executable and run:
```bash
chmod +x deploy.sh
./deploy.sh
```

## Support

For issues or questions:
- Check logs: `pm2 logs`
- Verify API key is working: `node test-new-api-key.js`
- Ensure ports are not blocked by firewall
- Check Node.js version: `node --version` (should be 16+)