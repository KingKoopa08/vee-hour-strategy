#!/bin/bash

# Local development startup script
echo "🚀 Starting PreMarket Strategy in development mode..."
echo "📍 Using local webhooks from .env.local"

# Explicitly set NODE_ENV to development
export NODE_ENV=development

# Start the server
node premarket-server.js