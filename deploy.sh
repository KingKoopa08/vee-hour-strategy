#!/bin/bash

# Deployment script for Pre-Market Strategy Server
echo "🚀 Starting deployment of Pre-Market Strategy Server..."

# Set the API key
export POLYGON_API_KEY=AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW

# Stop any existing containers
echo "📦 Stopping existing containers..."
docker stop premarket-strategy 2>/dev/null || true
docker rm premarket-strategy 2>/dev/null || true

# Build the Docker image
echo "🔨 Building Docker image..."
docker build -t premarket-strategy .

# Run the new container
echo "🏃 Starting new container..."
docker run -d \
  --name premarket-strategy \
  -p 3012:3012 \
  -p 3006:3006 \
  -p 3007:3007 \
  -e POLYGON_API_KEY=$POLYGON_API_KEY \
  --restart unless-stopped \
  premarket-strategy

# Check if container is running
sleep 3
if docker ps | grep -q premarket-strategy; then
    echo "✅ Container is running!"
    echo ""
    echo "📊 Access your dashboards at:"
    echo "   Main Dashboard: http://your-vps-ip/"
    echo "   Pre-Market Dashboard: http://your-vps-ip/premarket-dashboard.html"
    echo "   Market Dashboard: http://your-vps-ip/market-dashboard.html"
    echo "   After-Hours Dashboard: http://your-vps-ip/afterhours-dashboard.html"
    echo ""
    echo "📡 API Endpoints:"
    echo "   http://your-vps-ip:3012/api/premarket/top-stocks"
    echo "   http://your-vps-ip:3012/api/stocks/most-active"
    echo "   http://your-vps-ip:3012/api/afterhours/top-movers"
    echo ""
    echo "🔍 Check logs with: docker logs -f premarket-strategy"
else
    echo "❌ Container failed to start. Check logs with: docker logs premarket-strategy"
    exit 1
fi