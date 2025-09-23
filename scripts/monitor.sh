#!/bin/bash

# Monitoring Script
# Check status and health of services
# Usage: bash monitor.sh

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}📊 SYSTEM MONITOR${NC}"
echo -e "${GREEN}===============================================${NC}"

# Check PM2 services
echo -e "${YELLOW}📊 Service Status:${NC}"
pm2 list

# Check memory usage
echo ""
echo -e "${YELLOW}💾 Memory Usage:${NC}"
free -h

# Check disk usage
echo ""
echo -e "${YELLOW}💿 Disk Usage:${NC}"
df -h | grep -E "^/dev/"

# Check API endpoint
echo ""
echo -e "${YELLOW}🌐 API Health Check:${NC}"
if curl -s -f http://localhost:3050/api/gainers > /dev/null; then
    echo -e "${GREEN}✅ API is responding${NC}"
    STOCKS=$(curl -s http://localhost:3050/api/gainers | python3 -c "import json,sys; print(json.load(sys.stdin)['count'])" 2>/dev/null || echo "0")
    echo "   Tracking $STOCKS stocks"
else
    echo -e "${RED}❌ API is not responding${NC}"
fi

# Check logs for errors
echo ""
echo -e "${YELLOW}📝 Recent Errors (if any):${NC}"
pm2 logs market-scanner --err --lines 5 --nostream 2>/dev/null || echo "No errors found"

# Show recent activity
echo ""
echo -e "${YELLOW}📝 Recent Activity:${NC}"
pm2 logs market-scanner --lines 5 --nostream