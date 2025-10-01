#!/bin/bash

# Fix for priceHistory/volumeHistory showing 0% changes
# Issue: Broadcast interval was storing stale cached data causing duplicates
# Fix: Only update history during API calls with fresh data

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}🔧 FIXING PRICE/VOLUME HISTORY UPDATES${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

echo -e "${YELLOW}Issue:${NC}"
echo "• WebSocket connected and broadcasting"
echo "• Backend has 298+ history entries"
echo "• BUT all price/volume changes showing 0%"
echo ""
echo -e "${YELLOW}Root Cause:${NC}"
echo "• trackHistoricalData() runs every second"
echo "• It was pushing STALE cached prices to priceHistory"
echo "• This filled history with 298 identical prices"
echo "• Result: All percentage calculations = 0%"
echo ""
echo -e "${YELLOW}Fix Applied:${NC}"
echo "• trackHistoricalData() now ONLY reads history (no writes)"
echo "• getVolumeMovers() now updates history with FRESH API data"
echo "• This ensures real price changes are tracked"
echo ""

# Step 1: Verify PM2 is running
echo -e "${YELLOW}📋 Step 1/4: Checking PM2 status...${NC}"
if pm2 list | grep -q "market-scanner"; then
    echo -e "${GREEN}✅ PM2 running market-scanner${NC}"
else
    echo -e "${RED}❌ market-scanner not found in PM2${NC}"
    exit 1
fi
echo ""

# Step 2: Show current logs (before restart)
echo -e "${YELLOW}📋 Step 2/4: Current log sample (showing 0% changes):${NC}"
pm2 logs market-scanner --lines 20 --nostream | grep -E "30s-change|Sample:" | tail -5
echo ""

# Step 3: Restart PM2 with updated code
echo -e "${YELLOW}📋 Step 3/4: Restarting market-scanner with fix...${NC}"
pm2 restart market-scanner
echo -e "${GREEN}✅ market-scanner restarted${NC}"
echo ""

# Step 4: Wait and verify
echo -e "${YELLOW}📋 Step 4/4: Waiting 60 seconds for history to build...${NC}"
echo "This allows time for fresh API data to populate priceHistory"
echo ""

for i in {60..1}; do
    printf "\r${CYAN}⏳ Waiting... ${i}s remaining${NC}"
    sleep 1
done
echo ""
echo ""

echo -e "${YELLOW}Checking for non-zero price changes:${NC}"
pm2 logs market-scanner --lines 50 --nostream | grep -E "30s-change|Sample:" | tail -10
echo ""

echo -e "${CYAN}============================================${NC}"
echo -e "${GREEN}✅ FIX DEPLOYED!${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Open: ${CYAN}https://daily3club.com/volume${NC}"
echo "  2. Check browser console - should still show 'Connected to WebSocket'"
echo "  3. Watch the Price Δ% columns - should show REAL percentages now!"
echo "  4. Monitor logs: ${CYAN}pm2 logs market-scanner | grep '30s-change'${NC}"
echo ""
echo -e "${YELLOW}Expected behavior:${NC}"
echo "  • After ~30s: 30s price changes start showing"
echo "  • After ~1m: 1m price changes start showing"
echo "  • After ~5m: All timeframes showing real data"
echo ""
echo -e "${YELLOW}If still showing 0%:${NC}"
echo "  • Check logs: ${CYAN}pm2 logs market-scanner | grep -A 2 'price changes'${NC}"
echo "  • Verify history: ${CYAN}pm2 logs market-scanner | grep 'hist='${NC}"
echo ""
