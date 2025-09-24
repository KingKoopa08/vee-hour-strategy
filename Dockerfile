FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application code
COPY . .

# Expose ports
EXPOSE 3050 3051

# Start the application
CMD ["node", "unified-scanner.js"]
