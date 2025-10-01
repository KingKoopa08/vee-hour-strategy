#!/bin/bash

# Quick script to check PM2 logs and diagnose issues

echo "=== PM2 STATUS ==="
pm2 status

echo ""
echo "=== RECENT LOGS (last 100 lines) ==="
pm2 logs market-scanner --lines 100 --nostream

echo ""
echo "=== CHECKING FOR ERRORS ==="
pm2 logs market-scanner --lines 100 --nostream | grep -i "error\|cannot\|failed\|exception" || echo "No errors found"

echo ""
echo "=== TESTING ENDPOINTS ==="
echo "Testing http://localhost:3050/"
curl -s http://localhost:3050/ | head -c 100
echo ""
echo ""
echo "Testing http://localhost:3050/api/gainers"
curl -s http://localhost:3050/api/gainers | head -c 200
echo ""

echo ""
echo "=== PORT STATUS ==="
netstat -tulpn | grep -E "3050|3051" || lsof -i :3050 -i :3051 || ss -tulpn | grep -E "3050|3051"
