# 🚀 Deployment Guide

Complete guide for deploying the PreMarket Strategy application to production.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Server Setup](#initial-server-setup)
3. [Application Deployment](#application-deployment)
4. [Domain Configuration](#domain-configuration)
5. [SSL Setup](#ssl-setup)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### Server Requirements
- VPS with Ubuntu 20.04+ or Debian 11+
- Minimum 2GB RAM, 2 CPU cores
- 20GB storage
- Root or sudo access
- Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)

### Required Accounts
- Polygon.io API key
- Domain name (e.g., daily3club.com)
- GitHub account (for repository access)

## Initial Server Setup

### 1. Connect to VPS
```bash
ssh debian@15.204.86.6
```

### 2. Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Install Dependencies
```bash
# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# PM2
sudo npm install -g pm2

# Git
sudo apt install -y git

# Nginx
sudo apt install -y nginx

# Build essentials
sudo apt install -y build-essential
```

### 4. Setup User Environment
```bash
# Create app directory
mkdir ~/apps
cd ~/apps

# Setup PM2 startup
pm2 startup systemd -u $USER --hp $HOME
```

## Application Deployment

### Method 1: Using Deployment Script (Recommended)

```bash
# Clone repository
cd ~
git clone https://github.com/KingKoopa08/vee-hour-strategy.git
cd vee-hour-strategy

# Make scripts executable
chmod +x scripts/*.sh

# Run deployment
sudo ./scripts/deploy.sh
```

### Method 2: Manual Deployment

#### Step 1: Clone and Setup
```bash
cd ~
git clone https://github.com/KingKoopa08/vee-hour-strategy.git
cd vee-hour-strategy
npm install
```

#### Step 2: Configure Environment
```bash
cat > .env << EOF
# Polygon.io API
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV

# Server Ports
PORT=3050
WS_PORT=3051

# Environment
NODE_ENV=production
EOF
```

#### Step 3: Start with PM2
```bash
pm2 start unified-scanner.js --name market-scanner \
  --max-memory-restart 1G \
  --log-date-format="YYYY-MM-DD HH:mm:ss"

pm2 save
```

#### Step 4: Verify
```bash
pm2 status
curl http://localhost:3050
```

## Domain Configuration

### 1. DNS Setup

Add these records at your domain registrar:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 15.204.86.6 | 3600 |
| CNAME | www | daily3club.com | 3600 |

### 2. Configure Nginx

#### Option A: System Nginx (Simple)
```bash
sudo ./scripts/setup-domain.sh
```

#### Option B: Manual Configuration
```bash
# Create config
sudo nano /etc/nginx/sites-available/daily3club.com
```

Add configuration:
```nginx
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

    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/daily3club.com /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Test Domain
```bash
# Wait for DNS propagation (5-30 minutes)
nslookup daily3club.com

# Test HTTP
curl http://daily3club.com
```

## SSL Setup

### Using Script (Recommended)
```bash
sudo ./scripts/setup-ssl-daily3club.sh
```

### Manual Let's Encrypt Setup
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d daily3club.com -d www.daily3club.com

# Test renewal
sudo certbot renew --dry-run
```

## Monitoring & Maintenance

### Application Monitoring

#### PM2 Commands
```bash
# Status
pm2 status

# Logs
pm2 logs market-scanner
pm2 logs market-scanner --lines 100

# Restart
pm2 restart market-scanner

# Monitor
pm2 monit
```

#### Health Checks
```bash
# Check if running
curl http://localhost:3050/api/gainers

# Check WebSocket
wscat -c ws://localhost:3051
```

### System Monitoring

```bash
# System resources
htop

# Disk usage
df -h

# Memory usage
free -h

# Network connections
netstat -tulpn

# Nginx status
systemctl status nginx

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Backup & Recovery

#### Backup Configuration
```bash
# Backup PM2 config
pm2 save

# Backup environment
cp .env .env.backup

# Backup Nginx config
sudo cp -r /etc/nginx /etc/nginx.backup
```

#### Restore Process
```bash
# Restore PM2
pm2 resurrect

# Restore from backup
cp .env.backup .env
pm2 restart market-scanner
```

## Updates & Upgrades

### Application Updates
```bash
cd ~/vee-hour-strategy

# Backup current version
git stash

# Pull updates
git pull origin main

# Install new dependencies
npm install

# Restart
pm2 restart market-scanner
```

### System Updates
```bash
# Update packages
sudo apt update && sudo apt upgrade

# Update Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Update PM2
npm update -g pm2
pm2 update
```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process
sudo lsof -i :3050

# Kill process
sudo fuser -k 3050/tcp

# Restart
pm2 restart market-scanner
```

#### PM2 Not Starting
```bash
# Delete and recreate
pm2 delete market-scanner
pm2 start unified-scanner.js --name market-scanner
pm2 save
```

#### Nginx 502 Bad Gateway
```bash
# Check if app is running
pm2 status
curl http://localhost:3050

# Check logs
pm2 logs market-scanner
sudo tail -f /var/log/nginx/error.log

# Restart both
pm2 restart market-scanner
sudo systemctl restart nginx
```

#### Domain Not Working
```bash
# Check DNS
nslookup daily3club.com
dig daily3club.com

# Check Nginx
sudo nginx -t
sudo systemctl status nginx

# Check firewall
sudo ufw status
```

### Debug Mode

```bash
# Run in debug mode
NODE_ENV=development node unified-scanner.js

# Enable PM2 debug
pm2 start unified-scanner.js --name market-scanner-debug --watch --ignore-watch="node_modules"

# Check all logs
journalctl -u nginx -f
pm2 logs --lines 200
```

### Performance Issues

```bash
# Check memory usage
pm2 info market-scanner

# Increase memory limit
pm2 delete market-scanner
pm2 start unified-scanner.js --name market-scanner --max-memory-restart 2G

# Check CPU usage
pm2 monit
```

## Security Hardening

### Firewall Setup
```bash
# Enable UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### Fail2ban Setup
```bash
# Install
sudo apt install fail2ban

# Configure
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl restart fail2ban
```

### SSL Security Headers
Add to Nginx config:
```nginx
add_header Strict-Transport-Security "max-age=63072000" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
```

## Production Checklist

- [ ] Server provisioned and accessible
- [ ] Dependencies installed (Node.js, PM2, Nginx)
- [ ] Repository cloned
- [ ] Environment variables configured (.env)
- [ ] Application running with PM2
- [ ] PM2 startup configured
- [ ] Domain DNS configured
- [ ] Nginx proxy configured
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Monitoring setup
- [ ] Backup strategy in place
- [ ] Documentation updated

## Support Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `deploy.sh` | Full deployment | `sudo ./scripts/deploy.sh` |
| `diagnose.sh` | Troubleshooting | `./scripts/diagnose.sh` |
| `rebuild.sh` | Clean rebuild | `sudo ./scripts/rebuild.sh` |
| `setup-domain.sh` | Domain setup | `sudo ./scripts/setup-domain.sh` |
| `setup-ssl.sh` | SSL setup | `sudo ./scripts/setup-ssl.sh` |
| `fix-routing.sh` | Fix routing | `sudo ./scripts/fix-routing.sh` |

## Contact Information

- **Repository**: https://github.com/KingKoopa08/vee-hour-strategy
- **Production URL**: https://daily3club.com
- **Server IP**: 15.204.86.6
- **API Endpoint**: https://daily3club.com/api/gainers

---

Last Updated: September 2024