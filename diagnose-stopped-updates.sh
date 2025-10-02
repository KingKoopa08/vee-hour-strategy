#!/bin/bash

# Diagnose why production site stopped updating

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔍 DIAGNOSING STOPPED UPDATES${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# 1. Check PM2 status
echo -e "${CYAN}1. PM2 PROCESS STATUS${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
pm2 status
echo ""

# 2. Check if market-scanner is running
echo -e "${CYAN}2. MARKET-SCANNER STATUS${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if pm2 list | grep -q "market-scanner.*online"; then
    echo -e "${GREEN}✅ market-scanner is online${NC}"
    UPTIME=$(pm2 list | grep market-scanner | awk '{print $10}')
    echo -e "Uptime: ${CYAN}$UPTIME${NC}"
elif pm2 list | grep -q "market-scanner.*stopped"; then
    echo -e "${RED}❌ market-scanner is STOPPED${NC}"
    echo "Need to restart!"
elif pm2 list | grep -q "market-scanner.*errored"; then
    echo -e "${RED}❌ market-scanner has ERRORED${NC}"
    echo "Need to check logs and restart!"
else
    echo -e "${RED}❌ market-scanner not found${NC}"
fi
echo ""

# 3. Check recent logs for errors
echo -e "${CYAN}3. RECENT LOGS (Last 50 lines)${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
pm2 logs market-scanner --lines 50 --nostream | tail -30
echo ""

# 4. Check for error patterns
echo -e "${CYAN}4. ERROR DETECTION${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ERROR_COUNT=$(pm2 logs market-scanner --lines 100 --nostream 2>/dev/null | grep -c "Error\|ERROR\|error" || echo "0")
echo -e "Error count in last 100 lines: ${RED}$ERROR_COUNT${NC}"

if [ "$ERROR_COUNT" -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}Recent errors:${NC}"
    pm2 logs market-scanner --lines 100 --nostream | grep -i "error" | tail -5
fi
echo ""

# 5. Check WebSocket connectivity
echo -e "${CYAN}5. WEBSOCKET SERVER${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if netstat -tlnp 2>/dev/null | grep -q ":3051 " || ss -tlnp 2>/dev/null | grep -q ":3051 "; then
    echo -e "${GREEN}✅ Port 3051 is listening${NC}"
    netstat -tlnp 2>/dev/null | grep ":3051 " || ss -tlnp | grep ":3051 "
else
    echo -e "${RED}❌ Port 3051 NOT listening${NC}"
    echo "WebSocket server may not have started!"
fi
echo ""

# 6. Check HTTP server
echo -e "${CYAN}6. HTTP SERVER${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if netstat -tlnp 2>/dev/null | grep -q ":3050 " || ss -tlnp 2>/dev/null | grep -q ":3050 "; then
    echo -e "${GREEN}✅ Port 3050 is listening${NC}"

    # Test HTTP endpoint
    echo ""
    echo -e "${YELLOW}Testing /api/gainers endpoint:${NC}"
    RESPONSE=$(curl -s http://localhost:3050/api/gainers | head -c 100)
    if echo "$RESPONSE" | grep -q "symbol"; then
        echo -e "${GREEN}✅ HTTP endpoint responding${NC}"
        echo "Sample: $RESPONSE"
    else
        echo -e "${RED}❌ HTTP endpoint not responding correctly${NC}"
        echo "Response: $RESPONSE"
    fi
else
    echo -e "${RED}❌ Port 3050 NOT listening${NC}"
    echo "HTTP server may not have started!"
fi
echo ""

# 7. Check if broadcasting
echo -e "${CYAN}7. BROADCAST STATUS${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

BROADCAST_COUNT=$(pm2 logs market-scanner --lines 100 --nostream 2>/dev/null | grep -c "Broadcasted\|Broadcasting" || echo "0")
echo -e "Broadcast messages in last 100 lines: ${CYAN}$BROADCAST_COUNT${NC}"

if [ "$BROADCAST_COUNT" -eq 0 ]; then
    echo -e "${RED}⚠️  No broadcasting activity detected${NC}"
else
    echo -e "${GREEN}✅ Broadcasting is active${NC}"
    echo ""
    echo -e "${YELLOW}Recent broadcasts:${NC}"
    pm2 logs market-scanner --lines 100 --nostream | grep "Broadcasted\|Broadcasting" | tail -3
fi
echo ""

# 8. Check client connections
echo -e "${CYAN}8. CLIENT CONNECTIONS${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

CLIENT_COUNT=$(pm2 logs market-scanner --lines 100 --nostream 2>/dev/null | grep -c "Client connected" || echo "0")
echo -e "Client connections in last 100 lines: ${CYAN}$CLIENT_COUNT${NC}"

if [ "$CLIENT_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No recent client connections${NC}"
    echo "This might mean:"
    echo "  • nginx not proxying correctly"
    echo "  • Frontend can't reach WebSocket"
    echo "  • Certificate/SSL issues"
else
    echo -e "${GREEN}✅ Clients are connecting${NC}"
fi
echo ""

# 9. Summary and recommendations
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}📋 DIAGNOSIS SUMMARY${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Determine likely issue
if ! pm2 list | grep -q "market-scanner.*online"; then
    echo -e "${RED}ISSUE: market-scanner is not running${NC}"
    echo ""
    echo -e "${YELLOW}Fix:${NC}"
    echo "  ${CYAN}pm2 restart market-scanner${NC}"
    echo "  ${CYAN}pm2 logs market-scanner${NC}"
elif [ "$ERROR_COUNT" -gt 5 ]; then
    echo -e "${RED}ISSUE: Multiple errors detected${NC}"
    echo ""
    echo -e "${YELLOW}Fix:${NC}"
    echo "  1. Check error logs above"
    echo "  2. Fix code issue"
    echo "  3. ${CYAN}pm2 restart market-scanner${NC}"
elif ! netstat -tlnp 2>/dev/null | grep -q ":3051 " && ! ss -tlnp 2>/dev/null | grep -q ":3051 "; then
    echo -e "${RED}ISSUE: WebSocket server not listening on port 3051${NC}"
    echo ""
    echo -e "${YELLOW}Fix:${NC}"
    echo "  1. Check .env file has WS_PORT=3051"
    echo "  2. ${CYAN}pm2 restart market-scanner --update-env${NC}"
    echo "  3. Check logs for startup errors"
elif [ "$BROADCAST_COUNT" -eq 0 ]; then
    echo -e "${RED}ISSUE: Not broadcasting data${NC}"
    echo ""
    echo -e "${YELLOW}Fix:${NC}"
    echo "  1. Check if data fetch is working"
    echo "  2. Look for errors in logs"
    echo "  3. ${CYAN}pm2 restart market-scanner${NC}"
elif [ "$CLIENT_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}ISSUE: No client connections (nginx/proxy issue)${NC}"
    echo ""
    echo -e "${YELLOW}Fix:${NC}"
    echo "  1. Check nginx is running and configured correctly"
    echo "  2. Verify: ${CYAN}./fix-nginx-gateway-ip.sh${NC}"
    echo "  3. Test WebSocket from browser console"
else
    echo -e "${GREEN}✅ Everything appears to be running${NC}"
    echo ""
    echo -e "${YELLOW}If site still not updating:${NC}"
    echo "  1. Check browser console for errors"
    echo "  2. Verify frontend is connecting to WebSocket"
    echo "  3. Check if price changes are non-zero: ${CYAN}pm2 logs market-scanner | grep '30s-change'${NC}"
fi
echo ""
