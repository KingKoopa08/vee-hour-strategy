#!/bin/bash

# ============================================
# MASTER DEPLOYMENT SCRIPT
# One command to rule them all!
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Display banner
clear
echo -e "${CYAN}${BOLD}"
echo "╔══════════════════════════════════════════════╗"
echo "║     PREMARKET SCANNER - DEPLOYMENT TOOL     ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running locally or need remote deployment
if [ "$1" == "local" ] || [ -z "$1" ]; then
    # Local deployment
    echo -e "${YELLOW}Select deployment option:${NC}"
    echo "  1) Fresh Install (First time setup)"
    echo "  2) Update Code (Pull latest changes)"
    echo "  3) Full Redeploy (Clean install)"
    echo "  4) Setup Health Monitoring"
    echo "  5) View Logs"
    echo "  6) Exit"
    echo ""
    read -p "Enter option (1-6): " option

    case $option in
        1)
            echo -e "${CYAN}🚀 Starting fresh installation...${NC}"

            # Check if already exists
            if [ -d "/opt/premarket-scanner" ]; then
                echo -e "${YELLOW}⚠️  Installation already exists!${NC}"
                read -p "Overwrite? (y/n): " confirm
                if [ "$confirm" != "y" ]; then
                    exit 0
                fi
                rm -rf /opt/premarket-scanner
            fi

            # Install dependencies
            ./setup-server.sh

            # Clone repository
            cd /opt
            git clone https://github.com/yourusername/PreMarket_Strategy.git premarket-scanner
            cd premarket-scanner

            # Setup environment
            cat > .env << EOF
POLYGON_API_KEY=KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV
PORT=3050
WS_PORT=3051
NODE_ENV=production
EOF

            # Install and start
            npm install --production
            pm2 start unified-scanner.js --name market-scanner \
                --max-memory-restart 1G \
                --log-date-format="YYYY-MM-DD HH:mm:ss"
            pm2 save

            echo -e "${GREEN}✅ Installation complete!${NC}"
            echo -e "Access at: ${CYAN}http://localhost:3050${NC}"
            ;;

        2)
            echo -e "${CYAN}🔄 Updating code...${NC}"
            ./update-production.sh
            ;;

        3)
            echo -e "${CYAN}♻️  Full redeploy...${NC}"
            pm2 delete market-scanner 2>/dev/null || true
            cd /opt/premarket-scanner
            git pull
            npm ci --production
            pm2 start unified-scanner.js --name market-scanner
            pm2 save
            echo -e "${GREEN}✅ Redeploy complete!${NC}"
            ;;

        4)
            echo -e "${CYAN}🏥 Setting up health monitoring...${NC}"
            chmod +x health-check.sh

            # Add to crontab
            (crontab -l 2>/dev/null | grep -v "health-check.sh" ; echo "*/5 * * * * /opt/premarket-scanner/health-check.sh") | crontab -

            echo -e "${GREEN}✅ Health check enabled (runs every 5 minutes)${NC}"
            echo -e "View health logs: ${CYAN}tail -f /var/log/market-scanner-health.log${NC}"
            ;;

        5)
            echo -e "${CYAN}📋 Showing logs...${NC}"
            pm2 logs market-scanner --lines 50
            ;;

        6)
            echo -e "${CYAN}👋 Goodbye!${NC}"
            exit 0
            ;;

        *)
            echo -e "${RED}Invalid option!${NC}"
            exit 1
            ;;
    esac

else
    # Remote deployment
    SERVER_IP="$1"

    echo -e "${YELLOW}Remote deployment to: ${CYAN}${SERVER_IP}${NC}"
    echo -e "${YELLOW}Select option:${NC}"
    echo "  1) First Time Setup + Deploy"
    echo "  2) Deploy/Update Only"
    echo "  3) Quick Update (just pull & restart)"
    echo ""
    read -p "Enter option (1-3): " option

    case $option in
        1)
            echo -e "${CYAN}🔧 Running server setup...${NC}"
            scp setup-server.sh root@${SERVER_IP}:/tmp/
            ssh root@${SERVER_IP} "chmod +x /tmp/setup-server.sh && /tmp/setup-server.sh"

            echo -e "${CYAN}🚀 Deploying application...${NC}"
            ./deploy-production.sh ${SERVER_IP}
            ;;

        2)
            echo -e "${CYAN}🚀 Deploying...${NC}"
            ./deploy-production.sh ${SERVER_IP}
            ;;

        3)
            echo -e "${CYAN}🔄 Quick update...${NC}"
            ./update-production.sh ${SERVER_IP}
            ;;

        *)
            echo -e "${RED}Invalid option!${NC}"
            exit 1
            ;;
    esac
fi

echo ""
echo -e "${GREEN}${BOLD}✨ Operation completed successfully!${NC}"