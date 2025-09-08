#!/bin/bash

echo "🚀 Starting Trading Analysis Platform..."
echo "================================"

# Check if running on Windows (WSL)
if grep -qi microsoft /proc/version; then
    echo "📌 Detected WSL environment"
fi

# Stop any existing containers
echo "🔄 Stopping existing containers..."
docker-compose -f docker-compose.dev.yml down 2>/dev/null

# Start services
echo "🐳 Starting Docker containers..."
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🔍 Checking service status..."
docker-compose -f docker-compose.dev.yml ps

echo ""
echo "✅ Trading Analysis Platform is starting!"
echo "================================"
echo "📊 Frontend:   http://localhost:3010"
echo "🔌 Backend API: http://localhost:3001" 
echo "📡 WebSocket:   ws://localhost:3002"
echo "================================"
echo ""
echo "📝 View logs: docker-compose -f docker-compose.dev.yml logs -f"
echo "🛑 Stop:      docker-compose -f docker-compose.dev.yml down"
echo ""
echo "⚠️  Note: Frontend may take 30-60 seconds to fully compile on first start"