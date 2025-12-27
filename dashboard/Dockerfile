FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias del sistema para compilación (si es necesario por bcrypt u otros)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

# Instalar dependencias runtime para bcrypt
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

# Crear directorio de datos
RUN mkdir -p /app/data

# Puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

# Ejecutar
CMD ["node", "dist/index.js"]
