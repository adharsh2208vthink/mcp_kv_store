FROM node:18-alpine

# Install Redis
RUN apk add --no-cache redis

WORKDIR /app

# Copy and install ALL dependencies (including dev dependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Remove dev dependencies after build
RUN npm ci --only=production && npm cache clean --force

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'redis-server --daemonize yes' >> /app/start.sh && \
    echo 'sleep 2' >> /app/start.sh && \
    echo 'node dist/kv-store/index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 3000

CMD ["/app/start.sh"]