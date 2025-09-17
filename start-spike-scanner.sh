#!/bin/bash

echo "⚡ SPIKE SCANNER STARTUP"
echo "========================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Kill any existing servers
echo -e "${YELLOW}🔄 Stopping any existing servers...${NC}"
pkill -f "spike-server.js" 2>/dev/null || true
pkill -f "premarket-server.js" 2>/dev/null || true
sleep 2

# Start spike server
echo -e "${GREEN}🚀 Starting spike detection server...${NC}"
node spike-server.js &
SPIKE_PID=$!
echo "   Spike server PID: $SPIKE_PID"

# Wait for server to start
sleep 3

# Open browser
echo -e "${GREEN}🌐 Opening spike scanner in browser...${NC}"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "http://localhost:3019/spike-scanner.html" 2>/dev/null &
elif [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:3019/spike-scanner.html"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    start "http://localhost:3019/spike-scanner.html"
fi

echo ""
echo -e "${GREEN}✅ SPIKE SCANNER IS RUNNING${NC}"
echo ""
echo "📊 Access Points:"
echo "   - Web UI: http://localhost:3019/spike-scanner.html"
echo "   - API: http://localhost:3019/api/spikes/active"
echo "   - WebSocket: ws://localhost:3007"
echo ""
echo "📋 Configuration:"
echo "   - Max Price: \$100"
echo "   - Min Volume Burst: 5x"
echo "   - Detection Window: 10 seconds"
echo ""
echo "🎯 Detection Criteria:"
echo "   - Price movement: 1%+ in 10 seconds"
echo "   - Volume surge: 5x+ normal rate"
echo "   - Dollar volume: \$500K+ minimum"
echo "   - More upticks than downticks"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Keep script running and handle shutdown
trap "echo -e '\n${YELLOW}Shutting down...${NC}'; kill $SPIKE_PID 2>/dev/null; exit" INT TERM

# Keep the script running
while true; do
    sleep 1
done