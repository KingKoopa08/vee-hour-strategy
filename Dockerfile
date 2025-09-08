FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY premarket-server.js ./
COPY *.html ./

# Expose ports
EXPOSE 3011 3006

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Start the application
CMD ["node", "premarket-server.js"]