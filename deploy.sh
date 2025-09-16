#!/bin/bash

# Quick deploy script for VPS
cd /opt/vee-hour-strategy
git pull origin main
docker stop premarket-strategy
docker rm premarket-strategy
docker build --no-cache -t premarket-strategy .
docker run -d --name premarket-strategy -p 3018:3018 --restart unless-stopped premarket-strategy
echo "✅ Deployment complete!"
docker logs --tail 10 premarket-strategy