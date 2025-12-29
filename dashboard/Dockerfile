FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files and workspace package files
COPY package*.json ./
COPY dashboard/package*.json ./dashboard/
COPY shared/package*.json ./shared/

# Install all dependencies
RUN npm ci

# Copy source code
COPY dashboard ./dashboard
COPY shared ./shared

# Build shared package first
RUN cd shared && npm run build

# Build dashboard
WORKDIR /app/dashboard
RUN npm run build

# -----------------------------------------------------------------------------
# Production Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY dashboard/package*.json ./dashboard/
COPY shared/package*.json ./shared/

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /app/dashboard/dist ./dashboard/dist
COPY --from=builder /app/shared/dist ./shared/dist

# Crear directorio de datos
RUN mkdir -p /app/dashboard/data

# Puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production
ENV DATA_DIR=/app/dashboard/data

# Ejecutar
WORKDIR /app/dashboard
CMD ["node", "dist/index.js"]
