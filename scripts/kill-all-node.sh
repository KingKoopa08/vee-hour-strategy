#!/bin/bash

# Kill ALL Node.js processes forcefully

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}💀 KILLING ALL NODE PROCESSES${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Finding ALL Node.js processes...${NC}"
ps aux | grep -E "node|unified-scanner" | grep -v grep || echo "No Node processes found"

echo ""
echo -e "${YELLOW}📋 Step 2: Killing PM2...${NC}"
pm2 kill 2>/dev/null || true
rm -rf ~/.pm2 2>/dev/null || true
rm -rf /home/debian/.pm2 2>/dev/null || true

echo ""
echo -e "${YELLOW}📋 Step 3: Force killing all Node processes...${NC}"

# Kill by name
pkill -9 -f node 2>/dev/null || true
pkill -9 -f unified-scanner 2>/dev/null || true

# Kill by port
sudo fuser -k 3050/tcp 2>/dev/null || true
sudo fuser -k 3051/tcp 2>/dev/null || true

# Kill by PID if still exists
for pid in $(lsof -t -i :3050); do
    echo "Killing PID $pid on port 3050"
    sudo kill -9 $pid 2>/dev/null || true
done

for pid in $(lsof -t -i :3051); do
    echo "Killing PID $pid on port 3051"
    sudo kill -9 $pid 2>/dev/null || true
done

# Kill any process by user debian running node
sudo pkill -9 -u debian node 2>/dev/null || true

echo -e "${GREEN}✅ All Node processes killed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 4: Verifying ports are FREE...${NC}"

if lsof -i :3050 2>/dev/null; then
    echo -e "${RED}❌ STILL PROCESSES ON 3050!${NC}"
    echo "Trying nuclear option..."
    sudo kill -9 $(lsof -t -i :3050) 2>/dev/null || true
    sleep 2
fi

if lsof -i :3051 2>/dev/null; then
    echo -e "${RED}❌ STILL PROCESSES ON 3051!${NC}"
    echo "Trying nuclear option..."
    sudo kill -9 $(lsof -t -i :3051) 2>/dev/null || true
    sleep 2
fi

# Final check
echo ""
echo "Final port status:"
echo "Port 3050:"
sudo lsof -i :3050 2>/dev/null || echo "✅ Port 3050 is FREE"
echo "Port 3051:"
sudo lsof -i :3051 2>/dev/null || echo "✅ Port 3051 is FREE"

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}✅ ALL NODE PROCESSES KILLED${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}Ports should now be free for Docker!${NC}"
echo ""
echo "Now run:"
echo "docker-compose -f docker-compose.market-scanner.yml up -d"