#!/bin/bash

# ============================================
# HEALTH CHECK & AUTO-RECOVERY
# Add to cron: */5 * * * * /opt/premarket-scanner/health-check.sh
# ============================================

# Configuration
APP_DIR="/opt/premarket-scanner"
SERVICE_NAME="market-scanner"
HEALTH_URL="http://localhost:3050/api/gainers"
LOG_FILE="/var/log/market-scanner-health.log"
MAX_RETRIES=3

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
}

# Check if service is running
check_service() {
    if pm2 list | grep -q "$SERVICE_NAME.*online"; then
        return 0
    else
        return 1
    fi
}

# Check HTTP endpoint
check_http() {
    if curl -s --max-time 10 $HEALTH_URL > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Restart service
restart_service() {
    log_message "Attempting to restart $SERVICE_NAME..."
    cd $APP_DIR
    pm2 restart $SERVICE_NAME
    sleep 10
}

# Main health check logic
main() {
    # Check PM2 service status
    if ! check_service; then
        log_message "ERROR: Service $SERVICE_NAME is not running"

        for i in $(seq 1 $MAX_RETRIES); do
            log_message "Restart attempt $i of $MAX_RETRIES"
            restart_service

            if check_service && check_http; then
                log_message "SUCCESS: Service recovered"
                exit 0
            fi
        done

        log_message "CRITICAL: Failed to recover service after $MAX_RETRIES attempts"

        # Try complete restart
        log_message "Attempting complete service restart..."
        cd $APP_DIR
        pm2 delete $SERVICE_NAME 2>/dev/null || true
        pm2 start unified-scanner.js --name $SERVICE_NAME \
            --max-memory-restart 1G \
            --log-date-format="YYYY-MM-DD HH:mm:ss"
        pm2 save

        exit 1
    fi

    # Check HTTP endpoint
    if ! check_http; then
        log_message "WARNING: HTTP endpoint not responding"
        restart_service

        if check_http; then
            log_message "SUCCESS: HTTP endpoint recovered"
        else
            log_message "ERROR: HTTP endpoint still not responding"
            exit 1
        fi
    fi
}

# Run main function
main