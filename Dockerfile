FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with legacy peer deps to resolve conflicts
RUN npm ci --only=production --legacy-peer-deps

# Copy all application files
COPY . .

# Expose port for API and WebSocket (WebSocket uses /ws path on same port in production)
EXPOSE 3018

# Set environment variables
ENV NODE_ENV=production
ENV POLYGON_API_KEY=AhYeb0tc72ti39yZpxdNpoZx6_CD9IYW

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Start the application
CMD ["node", "premarket-server.js"]