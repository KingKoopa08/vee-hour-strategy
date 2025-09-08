#!/bin/bash

echo "🚀 Starting Trading Platform Locally (No Docker)"
echo "================================================"

# Start backend
echo "📦 Starting backend..."
cd backend
npm install
npm run dev &
BACKEND_PID=$!

# Wait for backend to start
sleep 5

# Start frontend
echo "📦 Starting frontend..."
cd ../frontend
npm install
npm run dev -- -p 3010 &
FRONTEND_PID=$!

echo ""
echo "✅ Services starting..."
echo "================================"
echo "📊 Frontend:    http://localhost:3010"
echo "🔌 Backend API: http://localhost:3001"
echo "📡 WebSocket:   ws://localhost:3002"
echo "================================"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait