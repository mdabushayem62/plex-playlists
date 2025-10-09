# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY drizzle.config.ts ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle migrations
COPY drizzle ./drizzle

# Copy healthcheck script
COPY healthcheck.js ./healthcheck.js

# Create data directory for SQLite database
RUN mkdir -p /data && chown -R node:node /data

# Switch to non-root user
USER node

# Set environment defaults
ENV NODE_ENV=production \
    DATABASE_PATH=/data/plex-playlists.db

# Health check (verifies database access and scheduler activity)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node healthcheck.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default command starts the scheduler
CMD ["node", "dist/cli.js", "start"]
