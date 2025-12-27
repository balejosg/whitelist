FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files and workspace package files
COPY package*.json ./
COPY api/package*.json ./api/
COPY shared/package*.json ./shared/

# Install all dependencies
RUN npm ci

# Copy source code
COPY api ./api
COPY shared ./shared

# Build shared package first
RUN cd shared && npm run build

# Build TypeScript to dist/
WORKDIR /app/api
RUN npm run build

# -----------------------------------------------------------------------------
# Production Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./
COPY api/package*.json ./api/
COPY shared/package*.json ./shared/

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/shared/dist ./shared/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check (API is strictly JSON, but /health might return 200 OK)
# Assuming wget works on localhost
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the compiled application
WORKDIR /app/api
CMD ["node", "dist/server.js"]
