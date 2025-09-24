#!/bin/bash

# Remove Rising Stocks and Spike Detector features

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🗑️  REMOVING RISING STOCKS & SPIKE DETECTOR${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${YELLOW}📋 Step 1: Backing up current file...${NC}"
cp unified-scanner.js unified-scanner.js.backup.$(date +%Y%m%d-%H%M%S)
echo -e "${GREEN}✅ Backup created${NC}"

echo ""
echo -e "${YELLOW}📋 Step 2: Creating Python script to remove features...${NC}"

cat > remove_features.py << 'EOF'
import re

# Read the file
with open('unified-scanner.js', 'r') as f:
    content = f.read()

# Remove Rising Stocks route (lines ~1110-1308)
pattern1 = r'// Rising stocks page\napp\.get\(\'/rising\'.*?(?=// |\napp\.|\n\n// |\Z)'
content = re.sub(pattern1, '', content, flags=re.DOTALL)

# Remove Spike Detector route (lines ~1308-1500)
pattern2 = r'// Spike detector page.*?app\.get\(\'/spikes\'.*?(?=// |\napp\.|\n\n// |\Z)'
content = re.sub(pattern2, '', content, flags=re.DOTALL)

# Remove Rising Stocks link from navigation in all pages
content = re.sub(r'<a href="/rising"[^>]*>.*?Rising Stocks.*?</a>\n', '', content)
content = re.sub(r'<a href="/rising"[^>]*>.*?Rising Stocks.*?</a>', '', content)

# Remove Spike Detector link from navigation in all pages
content = re.sub(r'<a href="/spikes"[^>]*>.*?Spike Detector.*?</a>\n', '', content)
content = re.sub(r'<a href="/spikes"[^>]*>.*?Spike Detector.*?</a>', '', content)

# Remove Rising Stocks card from home page
pattern3 = r'<a href="/rising" class="scanner-card">.*?</a>'
content = re.sub(pattern3, '', content, flags=re.DOTALL)

# Remove Spike Detector card from home page
pattern4 = r'<a href="/spikes" class="scanner-card">.*?</a>'
content = re.sub(pattern4, '', content, flags=re.DOTALL)

# Remove Rising Stocks from console log
content = content.replace("console.log(`📡 Rising Stocks: http://localhost:${PORT}/rising`);\n    ", "")

# Remove Spike Detector from console log
content = content.replace("console.log(`📡 Spike Detector: http://localhost:${PORT}/spikes`);\n    ", "")

# Clean up any double newlines
content = re.sub(r'\n\n\n+', '\n\n', content)

# Write the file back
with open('unified-scanner.js', 'w') as f:
    f.write(content)

print("✅ Rising Stocks and Spike Detector features removed")

# Count remaining routes
routes = len(re.findall(r"app\.get\('", content))
print(f"📊 Remaining routes: {routes}")
EOF

python3 remove_features.py
rm remove_features.py

echo -e "${GREEN}✅ Features removed${NC}"

echo ""
echo -e "${YELLOW}📋 Step 3: Updating navigation in remaining pages...${NC}"

# Additional cleanup - ensure navigation only has Gainers and Volume in all pages
sed -i 's|<div class="nav-links">.*</div>|<div class="nav-links">\n            <a href="/gainers">🔥 Top Gainers</a>\n            <a href="/volume">📊 Volume Movers</a>\n        </div>|g' unified-scanner.js

echo -e "${GREEN}✅ Navigation updated${NC}"

echo ""
echo -e "${YELLOW}📋 Step 4: Verifying removal...${NC}"

if grep -q "/rising" unified-scanner.js; then
    echo -e "${YELLOW}⚠️  Some references to /rising may still exist${NC}"
else
    echo -e "${GREEN}✅ Rising Stocks route removed${NC}"
fi

if grep -q "/spikes" unified-scanner.js; then
    echo -e "${YELLOW}⚠️  Some references to /spikes may still exist${NC}"
else
    echo -e "${GREEN}✅ Spike Detector route removed${NC}"
fi

echo ""
echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}✅ FEATURES REMOVED${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

echo -e "${GREEN}Rising Stocks and Spike Detector have been removed${NC}"
echo ""
echo "The site now has:"
echo "• Top Gainers (/gainers)"
echo "• Volume Movers (/volume)"
echo ""
echo "To deploy: git add . && git commit -m 'Remove Rising Stocks and Spike Detector' && git push"