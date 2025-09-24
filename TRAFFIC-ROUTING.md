# 🌐 Traffic Routing & Nginx Configuration Guide

## Overview

This guide explains how to configure traffic routing for multiple applications on a single VPS server using Nginx as a reverse proxy.

## Current Server Architecture

```
┌─────────────────────────────────────────────────────┐
│                 VPS Server (15.204.86.6)            │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Port 80/443 (Currently Blocked by THC Docker)      │
│  ┌────────────────────────────────────────────┐     │
│  │ THC Docker Nginx Container (thc_nginx)     │     │
│  │ - Intercepts ALL traffic on port 80        │     │
│  │ - Needs reconfiguration for multi-domain   │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
│  Port 3010 - Trading Application (Docker)           │
│  ┌────────────────────────────────────────────┐     │
│  │ trading-frontend container                 │     │
│  │ - Accessible at IP:3010                    │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
│  Port 3050 - Market Scanner (PM2)                   │
│  ┌────────────────────────────────────────────┐     │
│  │ unified-scanner.js                         │     │
│  │ - Target for daily3club.com                │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
│  Port 3051 - WebSocket Server (PM2)                 │
│  ┌────────────────────────────────────────────┐     │
│  │ WebSocket for real-time updates            │     │
│  └────────────────────────────────────────────┘     │
│                                                      │
│  Internal Docker Containers:                        │
│  - thc_frontend (3000)                              │
│  - thc_backend (5000)                               │
│  - thc_postgres, thc_redis                          │
│  - trading-db (5434)                                │
│  - trading-cache (6379)                             │
└─────────────────────────────────────────────────────┘
```

## The Problem

- **THC nginx Docker container** occupies port 80
- It serves THC application for ALL incoming domains
- **daily3club.com** incorrectly routes to THC instead of Market Scanner
- Need multiple domains to route to different applications

## Solution Options

### Option 1: Configure THC Docker Nginx (Recommended for Production)

Add this configuration to THC nginx container:

**File to modify**: Inside THC Docker container or mounted config
```nginx
# Add to nginx configuration in THC container

# Market Scanner - daily3club.com
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;

    location / {
        # From Docker container to host machine port 3050
        # Try these in order until one works:
        proxy_pass http://host.docker.internal:3050;  # Docker Desktop
        # proxy_pass http://172.17.0.1:3050;          # Linux Docker default gateway
        # proxy_pass http://15.204.86.6:3050;         # Direct server IP

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://host.docker.internal:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Keep existing THC configuration for its domain
server {
    listen 80;
    server_name thc-domain.com;  # Replace with actual THC domain
    # ... existing THC configuration ...
}
```

**Implementation steps:**
```bash
# Find THC nginx config
docker exec thc_nginx ls /etc/nginx/conf.d/

# Edit configuration
docker exec thc_nginx vi /etc/nginx/conf.d/daily3club.conf

# Reload nginx
docker exec thc_nginx nginx -s reload
```

### Option 2: Replace Docker Nginx with System Nginx

Stop THC Docker nginx and use system nginx for all routing:

```bash
# Stop THC nginx
sudo docker stop thc_nginx

# Configure system nginx
sudo ./scripts/fix-routing.sh
```

**System nginx configuration** (`/etc/nginx/sites-available/multi-app`):
```nginx
# THC Application (needs port mapping)
server {
    listen 80;
    server_name thc.yourdomain.com;  # THC domain

    location / {
        proxy_pass http://localhost:3000;  # THC frontend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}

# Market Scanner - daily3club.com
server {
    listen 80;
    server_name daily3club.com www.daily3club.com;

    location / {
        proxy_pass http://localhost:3050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /ws {
        proxy_pass http://localhost:3051;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# Trading Application
server {
    listen 80;
    server_name trading.yourdomain.com;  # If you want a domain for it

    location / {
        proxy_pass http://localhost:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### Option 3: Port-Based Access

Keep THC on port 80, move others to different ports:

| Application | Access Method | Port |
|------------|---------------|------|
| THC App | http://15.204.86.6 | 80 |
| Market Scanner | http://daily3club.com:3050 | 3050 |
| Trading App | http://15.204.86.6:3010 | 3010 |

### Option 4: Subdomain Configuration

All on port 80 with subdomains:

| Application | Domain | Configuration |
|------------|--------|---------------|
| Market Scanner | daily3club.com | Main domain |
| THC App | thc.daily3club.com | Subdomain |
| Trading App | trading.daily3club.com | Subdomain |

## SSL/HTTPS Configuration

### For Docker Nginx (Option 1)

```bash
# Install certbot in container
docker exec thc_nginx apk add certbot certbot-nginx

# Get certificates
docker exec thc_nginx certbot --nginx -d daily3club.com -d www.daily3club.com

# Auto-renewal
docker exec thc_nginx crontab -l | { cat; echo "0 0 * * * certbot renew"; } | docker exec -i thc_nginx crontab -
```

### For System Nginx (Option 2)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d daily3club.com -d www.daily3club.com

# Auto-renewal is automatic via systemd timer
```

## DNS Configuration Requirements

### For daily3club.com

| Record Type | Name | Value | TTL |
|------------|------|-------|-----|
| A | @ | 15.204.86.6 | 3600 |
| CNAME | www | daily3club.com | 3600 |

### For Subdomains (if using)

| Record Type | Name | Value | TTL |
|------------|------|-------|-----|
| A | thc | 15.204.86.6 | 3600 |
| A | trading | 15.204.86.6 | 3600 |

## Troubleshooting Guide

### Check What's on Port 80
```bash
sudo lsof -i :80
```

### Check Docker Containers
```bash
sudo docker ps --format "table {{.Names}}\t{{.Ports}}"
```

### Test Domain Routing
```bash
# Test with Host header (simulates domain request)
curl -H "Host: daily3club.com" http://localhost

# Test actual domain
curl http://daily3club.com
```

### Check Nginx Logs

For Docker nginx:
```bash
docker logs thc_nginx --tail 50
```

For System nginx:
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Restart Services

```bash
# Docker nginx
docker restart thc_nginx

# System nginx
sudo systemctl restart nginx

# Market Scanner
pm2 restart market-scanner
```

## Quick Setup Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `setup-domain.sh` | Basic domain setup | `sudo ./scripts/setup-domain.sh` |
| `fix-routing.sh` | Fix routing issues | `sudo ./scripts/fix-routing.sh` |
| `setup-both-apps.sh` | Configure multiple apps | `sudo ./scripts/setup-both-apps.sh` |
| `setup-ssl-daily3club.sh` | SSL configuration | `sudo ./scripts/setup-ssl-daily3club.sh` |

## Current Issues & Solutions

### Issue: daily3club.com goes to wrong container

**Cause**: THC nginx intercepts all port 80 traffic

**Solution**:
1. Add daily3club.com server block to THC nginx config
2. OR stop THC nginx and use system nginx
3. Run: `sudo ./scripts/fix-routing.sh`

### Issue: Can't access THC app after fixing daily3club.com

**Solution**:
- Access via port 8080: `http://15.204.86.6:8080`
- OR configure subdomain: `thc.daily3club.com`
- OR use different domain for THC

### Issue: SSL certificate fails

**Common causes**:
- DNS not propagated (wait 5-30 minutes)
- Port 80 blocked by firewall
- Wrong domain configuration

**Solution**:
```bash
# Test DNS
nslookup daily3club.com

# Test HTTP first
curl http://daily3club.com

# Then try SSL
sudo ./scripts/setup-ssl-daily3club.sh
```

## Best Practices

1. **Use single nginx instance** (either Docker or system, not both)
2. **Configure all domains** in one place
3. **Use SSL/HTTPS** for production
4. **Monitor logs** regularly
5. **Keep ports organized**:
   - 80/443: Public web traffic
   - 3000+: Internal applications
   - 5000+: Databases and services

## Network Diagram

```
Internet
    ↓
daily3club.com (DNS)
    ↓
Server IP: 15.204.86.6
    ↓
Port 80/443 (Nginx)
    ├── daily3club.com → localhost:3050 (Market Scanner)
    ├── thc.domain.com → localhost:3000 (THC Frontend)
    └── trading.domain.com → localhost:3010 (Trading App)
```

## Contact & Support

For issues with:
- **Market Scanner**: Check PM2 logs: `pm2 logs market-scanner`
- **Docker containers**: Check Docker logs: `docker logs [container-name]`
- **Nginx routing**: Check nginx logs in `/var/log/nginx/`

## References

- [Nginx Reverse Proxy Guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
- [Docker Networking](https://docs.docker.com/network/)
- [Let's Encrypt with Nginx](https://certbot.eff.org/docs/)
- [PM2 Process Management](https://pm2.keymetrics.io/)