#!/bin/bash

# One-Command Installation Script
# Downloads and runs all necessary scripts
# Usage: curl -s https://raw.githubusercontent.com/KingKoopa08/vee-hour-strategy/main/scripts/install.sh | bash

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===============================================${NC}"
echo -e "${CYAN}🚀 VEE-HOUR STRATEGY - ONE CLICK INSTALLER${NC}"
echo -e "${CYAN}===============================================${NC}"
echo ""

# Configuration
GITHUB_RAW="https://raw.githubusercontent.com/KingKoopa08/vee-hour-strategy/main"
SCRIPTS_DIR="$HOME/market-scanner-scripts"

# Create scripts directory
echo -e "${YELLOW}📁 Creating scripts directory...${NC}"
mkdir -p "$SCRIPTS_DIR"
cd "$SCRIPTS_DIR"

# Download all scripts
echo -e "${YELLOW}📥 Downloading deployment scripts...${NC}"

# Download setup script
wget -q -O setup.sh "$GITHUB_RAW/scripts/setup.sh"
chmod +x setup.sh

# Download deploy script
wget -q -O deploy.sh "$GITHUB_RAW/scripts/deploy.sh"
chmod +x deploy.sh

# Download update script
wget -q -O update.sh "$GITHUB_RAW/scripts/update.sh"
chmod +x update.sh

# Download monitor script
wget -q -O monitor.sh "$GITHUB_RAW/scripts/monitor.sh"
chmod +x monitor.sh

echo -e "${GREEN}✅ Scripts downloaded${NC}"

# Check if this is first time setup
if ! command -v node &> /dev/null || ! command -v pm2 &> /dev/null; then
    echo ""
    echo -e "${YELLOW}🔧 First time setup detected. Running initial setup...${NC}"
    bash setup.sh
fi

# Run deployment
echo ""
echo -e "${YELLOW}🚀 Running deployment...${NC}"
bash deploy.sh

# Create convenience aliases
echo ""
echo -e "${YELLOW}📝 Creating convenience commands...${NC}"

# Add aliases to bashrc if not already present
if ! grep -q "market-scanner aliases" ~/.bashrc; then
    cat >> ~/.bashrc << 'EOF'

# market-scanner aliases
alias ms-logs='pm2 logs market-scanner'
alias ms-status='pm2 status'
alias ms-restart='pm2 restart market-scanner'
alias ms-monitor='bash ~/market-scanner-scripts/monitor.sh'
alias ms-update='bash ~/market-scanner-scripts/update.sh'
EOF
    echo -e "${GREEN}✅ Aliases added to ~/.bashrc${NC}"
fi

# Final message
echo ""
echo -e "${GREEN}===============================================${NC}"
echo -e "${GREEN}✅ INSTALLATION COMPLETE!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo ""
echo -e "${CYAN}📝 Quick Commands (after reopening terminal):${NC}"
echo "   ms-status   - Check service status"
echo "   ms-logs     - View logs"
echo "   ms-restart  - Restart services"
echo "   ms-monitor  - Full system monitor"
echo "   ms-update   - Update to latest version"
echo ""
echo -e "${CYAN}📁 Scripts Location:${NC}"
echo "   $SCRIPTS_DIR"
echo ""
echo -e "${CYAN}🔄 To apply aliases now, run:${NC}"
echo "   source ~/.bashrc"
echo ""

# Show current status
pm2 status