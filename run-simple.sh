#!/bin/bash

echo "🚀 Starting Trading Platform (Simple Version)"
echo "============================================="

# Kill any existing servers
pkill -f "test-server.js" 2>/dev/null
pkill -f "python3 -m http.server" 2>/dev/null

# Start the test backend
echo "📦 Starting backend server..."
cd "/mnt/d/Cursor Ideas/PreMarket_Stratedy"
node test-server.js &
BACKEND_PID=$!

sleep 2

# Start simple web server for HTML
echo "📦 Starting frontend on port 3010..."
python3 -m http.server 3010 --directory . &
FRONTEND_PID=$!

echo ""
echo "✅ Platform is ready!"
echo "================================"
echo "📊 Open in browser: http://localhost:3010/test-simple.html"
echo "🔌 Backend API: http://localhost:3001"
echo "📡 WebSocket: ws://localhost:3003"
echo "================================"
echo ""
echo "Press Ctrl+C to stop"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
wait