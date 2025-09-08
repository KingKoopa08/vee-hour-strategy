# VEE/HOUR Trading Strategy - Deployment Guide

## Quick Start Deployment

### 1. Create GitHub Repository

Since you don't have GitHub CLI installed, create the repository manually:

1. Go to https://github.com/new
2. Repository name: `vee-hour-strategy`
3. Make it public or private as needed
4. Don't initialize with README (we already have one)
5. Click "Create repository"

### 2. Push to GitHub

After creating the repository, run these commands in your local project directory:

```bash
# Add remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/vee-hour-strategy.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 3. Deploy to Debian Docker Server

SSH into your Debian server and run:

```bash
# Navigate to /opt directory
cd /opt

# Clone the repository
git clone https://github.com/YOUR_USERNAME/vee-hour-strategy.git

# Enter the project directory
cd vee-hour-strategy

# Create .env file from template
cp .env.example .env

# Edit .env and add your Polygon API key
nano .env
# Add: POLYGON_API_KEY=your_actual_api_key_here

# Deploy with Docker Compose
docker-compose -f docker-compose.production.yml up -d

# Check if services are running
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f
```

### 4. Access the Application

Once deployed, you can access:
- Live Dashboard: http://your-server-ip/
- Real Dashboard: http://your-server-ip/real.html
- API Health Check: http://your-server-ip/health
- WebSocket: ws://your-server-ip/ws

### 5. Managing the Deployment

```bash
# Stop services
docker-compose -f docker-compose.production.yml down

# Restart services
docker-compose -f docker-compose.production.yml restart

# Update to latest code
git pull
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml build --no-cache
docker-compose -f docker-compose.production.yml up -d

# View container logs
docker logs vee-hour-strategy -f
docker logs vee-hour-nginx -f
```

## SSL/HTTPS Setup (Optional)

For production, you should enable HTTPS:

1. Obtain SSL certificates (e.g., using Let's Encrypt)
2. Place certificates in `/opt/vee-hour-strategy/ssl/`
3. Update nginx.conf to include SSL configuration
4. Restart nginx container

## Monitoring

The application includes health checks that run every 30 seconds. You can monitor:
- Container health: `docker ps`
- Application logs: `docker logs vee-hour-strategy -f`
- System metrics: `docker stats`

## Troubleshooting

If the application doesn't start:
1. Check logs: `docker-compose -f docker-compose.production.yml logs`
2. Verify Polygon API key is set correctly in .env
3. Ensure ports 80, 443 are not in use: `netstat -tulpn | grep -E ':(80|443)'`
4. Check Docker is running: `systemctl status docker`

## Security Notes

- The application runs as non-root user in container
- Ensure firewall allows ports 80/443
- Keep your Polygon API key secret
- Regularly update Docker images for security patches

## Support

For issues or questions:
- Check application logs first
- Review the README.md for feature documentation
- Create an issue on GitHub if needed