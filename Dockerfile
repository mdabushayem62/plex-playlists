# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tsup.config.ts ./
COPY drizzle.config.ts ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code and scripts
COPY src ./src
COPY scripts ./scripts

# Build the application
RUN npm run build

# Compile TSX views to JS (for @kitajs/html JSX runtime)
RUN npx tsx scripts/compile-views.ts

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling and sqlite3 for CLI access
RUN apk add --no-cache dumb-init sqlite

# Copy package files
COPY package*.json ./

# Install only production dependencies
# HUSKY=0 disables git hooks during Docker build (husky is a dev dependency)
RUN HUSKY=0 npm ci --omit=dev && npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy web UI assets (views, static files, .tsx components loaded at runtime)
COPY --from=builder /app/src/web ./src/web

# Copy drizzle migrations
COPY drizzle ./drizzle

# Copy healthcheck script
COPY healthcheck.js ./healthcheck.js

# Create config and data directories
RUN mkdir -p /config /data && chown -R node:node /config /data

# Switch to non-root user
USER node

# Set environment defaults
ENV NODE_ENV=production \
    CONFIG_DIR=/config \
    DATA_DIR=/data \
    DATABASE_PATH=/data/plex-playlists.db

# Health check (verifies database access and scheduler activity)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node healthcheck.js || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Default command starts the scheduler
CMD ["node", "dist/cli.js", "start"]
