#!/bin/bash

# Market Scanner Hub - Deployment Script
# This script automates the deployment process to a VPS

set -e  # Exit on error

echo "====================================="
echo "🚀 Market Scanner Hub Deployment"
echo "====================================="

# Configuration
REPO_URL=${REPO_URL:-""}
DEPLOY_PATH=${DEPLOY_PATH:-"/var/www/market-scanner"}
PM2_APP_NAME="market-scanner"
NODE_ENV="production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if running as root (not recommended)
if [ "$EUID" -eq 0 ]; then
   print_warning "Running as root is not recommended. Consider using a regular user with sudo."
fi

# Step 1: Check prerequisites
echo ""
echo "📋 Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16+ first."
    echo "Run: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
else
    NODE_VERSION=$(node -v)
    print_status "Node.js installed: $NODE_VERSION"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed."
    exit 1
else
    NPM_VERSION=$(npm -v)
    print_status "npm installed: $NPM_VERSION"
fi

# Check git
if ! command -v git &> /dev/null; then
    print_error "Git is not installed. Installing..."
    sudo apt-get update && sudo apt-get install -y git
fi

# Step 2: Install PM2 globally if not installed
echo ""
echo "📦 Checking PM2..."
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 not found. Installing globally..."
    sudo npm install -g pm2
    print_status "PM2 installed"
else
    print_status "PM2 already installed"
fi

# Step 3: Clone or update repository
echo ""
echo "📥 Setting up application..."

if [ -z "$REPO_URL" ]; then
    print_error "Repository URL not set!"
    echo "Please set REPO_URL environment variable:"
    echo "export REPO_URL='https://github.com/yourusername/your-repo.git'"
    exit 1
fi

# Create deploy directory if it doesn't exist
sudo mkdir -p "$DEPLOY_PATH"
sudo chown $USER:$USER "$DEPLOY_PATH"

if [ -d "$DEPLOY_PATH/.git" ]; then
    print_status "Repository exists. Pulling latest changes..."
    cd "$DEPLOY_PATH"
    git stash
    git pull origin main
else
    print_status "Cloning repository..."
    git clone "$REPO_URL" "$DEPLOY_PATH"
    cd "$DEPLOY_PATH"
fi

# Step 4: Install dependencies
echo ""
echo "📚 Installing dependencies..."
npm ci --production || npm install --production
print_status "Dependencies installed"

# Step 5: Set up environment variables
echo ""
echo "🔐 Setting up environment..."

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        print_warning ".env file created from template. Please edit it to add your API keys:"
        echo "  nano $DEPLOY_PATH/.env"
        echo ""
        read -p "Press Enter after you've added your POLYGON_API_KEY to continue..."
    else
        print_error ".env.example not found!"
        exit 1
    fi
else
    print_status ".env file already exists"
fi

# Step 6: Create logs directory
echo ""
echo "📝 Setting up logging..."
mkdir -p logs
print_status "Logs directory created"

# Step 7: Stop existing PM2 process if running
echo ""
echo "🔄 Managing PM2 process..."
if pm2 list | grep -q "$PM2_APP_NAME"; then
    print_status "Stopping existing process..."
    pm2 stop "$PM2_APP_NAME"
    pm2 delete "$PM2_APP_NAME"
fi

# Step 8: Start application with PM2
echo ""
echo "🚀 Starting application..."
NODE_ENV=$NODE_ENV pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
echo ""
echo "⚙️  Setting up auto-start on boot..."
pm2 startup systemd -u $USER --hp $HOME | grep sudo | bash

print_status "PM2 auto-start configured"

# Step 9: Check application status
echo ""
echo "📊 Application Status:"
pm2 status "$PM2_APP_NAME"

# Step 10: Display access information
echo ""
echo "====================================="
echo "✅ Deployment Complete!"
echo "====================================="
echo ""
echo "📡 Access your application at:"
echo "  Main Hub: http://$(hostname -I | awk '{print $1}'):3000"
echo "  Top Gainers: http://$(hostname -I | awk '{print $1}'):3000/gainers"
echo "  Rising Stocks: http://$(hostname -I | awk '{print $1}'):3000/rising"
echo ""
echo "📝 Useful commands:"
echo "  View logs: pm2 logs $PM2_APP_NAME"
echo "  Monitor: pm2 monit"
echo "  Restart: pm2 restart $PM2_APP_NAME"
echo "  Stop: pm2 stop $PM2_APP_NAME"
echo "  Status: pm2 status"
echo ""

echo "🎉 Deployment script completed!"
