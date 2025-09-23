# Domain Setup Guide for daily3club.com

## Quick Start

1. **Configure DNS** (at your domain registrar):
   ```
   A Record: @ → 15.204.86.6
   CNAME: www → daily3club.com
   ```

2. **Run on your VPS**:
   ```bash
   cd ~/vee-hour-strategy
   chmod +x scripts/setup-domain.sh scripts/setup-ssl.sh
   sudo ./scripts/setup-domain.sh
   # Wait for DNS to propagate (5-30 mins)
   sudo ./scripts/setup-ssl.sh
   ```

3. **Access your site**:
   - http://daily3club.com (after step 2)
   - https://daily3club.com (after SSL setup)

## Architecture

```
Internet → daily3club.com → Nginx (port 80/443) → Your App (port 3050)
                                                 → WebSocket (port 3051)
```

## Detailed Steps

### Step 1: DNS Configuration

Go to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.) and add:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 15.204.86.6 | 3600 |
| CNAME | www | daily3club.com | 3600 |

**Note**: Some registrars use different notation:
- `@` might be shown as blank or as `daily3club.com`
- You might need to enter just `www` without the full domain

### Step 2: Server Setup

SSH into your VPS and run:

```bash
# Clone the repository if not already present
cd ~
git clone https://github.com/KingKoopa08/vee-hour-strategy.git
cd vee-hour-strategy

# Make scripts executable
chmod +x scripts/setup-domain.sh scripts/setup-ssl.sh

# Run domain setup
sudo ./scripts/setup-domain.sh
```

This will:
- Install/configure Nginx
- Setup reverse proxy from port 80 to 3050
- Configure WebSocket support
- Show you the DNS settings to configure

### Step 3: Verify DNS Propagation

Before setting up SSL, verify DNS is working:

```bash
# Test DNS resolution
nslookup daily3club.com
dig daily3club.com

# Test HTTP access
curl http://daily3club.com
```

### Step 4: SSL Setup (HTTPS)

Once DNS is working:

```bash
sudo ./scripts/setup-ssl.sh
```

Enter your email when prompted. This will:
- Install Certbot
- Obtain Let's Encrypt certificate
- Configure HTTPS redirect
- Setup auto-renewal

## Managing Multiple Domains

If you have other Docker containers on different ports, create additional Nginx configs:

### Example: another-domain.com → port 3001

Create `/etc/nginx/sites-available/another-domain.com`:

```nginx
server {
    listen 80;
    server_name another-domain.com www.another-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it:
```bash
sudo ln -s /etc/nginx/sites-available/another-domain.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Troubleshooting

### Domain not working?

1. **Check DNS propagation**:
   ```bash
   nslookup daily3club.com
   # Should return: 15.204.86.6
   ```

2. **Check Nginx status**:
   ```bash
   sudo systemctl status nginx
   sudo nginx -t
   ```

3. **Check if app is running**:
   ```bash
   curl http://localhost:3050
   pm2 status
   ```

4. **Check Nginx logs**:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   sudo tail -f /var/log/nginx/access.log
   ```

### SSL not working?

1. **Ensure DNS is working first**:
   ```bash
   curl http://daily3club.com
   ```

2. **Check certificate status**:
   ```bash
   sudo certbot certificates
   ```

3. **Test renewal**:
   ```bash
   sudo certbot renew --dry-run
   ```

4. **Force renewal if needed**:
   ```bash
   sudo certbot renew --force-renewal
   ```

## Firewall Configuration

If using UFW:

```bash
# Allow web traffic
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH

# Block direct port access (optional)
sudo ufw deny 3050
sudo ufw deny 3051

# Enable firewall
sudo ufw enable
```

## WebSocket Configuration

The setup includes WebSocket support. Your app can use:
- Regular HTTP/HTTPS: https://daily3club.com
- WebSocket: wss://daily3club.com/ws (proxied to port 3051)

In your client code, update WebSocket connection:
```javascript
// Old: ws://15.204.86.6:3051
// New:
const ws = new WebSocket('wss://daily3club.com/ws');
```

## Maintenance

### Update app without affecting domain:
```bash
cd ~/vee-hour-strategy
git pull
pm2 restart market-scanner
```

### Update Nginx config:
```bash
sudo nano /etc/nginx/sites-available/daily3club.com
sudo nginx -t
sudo systemctl reload nginx
```

### Monitor SSL renewal:
```bash
sudo certbot renew --dry-run
systemctl status certbot.timer
```

## Security Best Practices

1. **Keep ports closed**: Only expose 80/443 through Nginx
2. **Use HTTPS**: Always redirect HTTP to HTTPS
3. **Update regularly**:
   ```bash
   sudo apt update && sudo apt upgrade
   ```
4. **Monitor logs**: Check `/var/log/nginx/` regularly
5. **Backup**: Keep backups of `/etc/nginx/sites-available/`

## Support

- **Nginx Docs**: https://nginx.org/en/docs/
- **Certbot Docs**: https://certbot.eff.org/
- **Let's Encrypt**: https://letsencrypt.org/
- **SSL Test**: https://www.ssllabs.com/ssltest/