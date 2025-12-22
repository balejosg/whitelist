FROM node:20-alpine

WORKDIR /app

# Instalar dependencias del sistema para better-sqlite3
RUN apk add --no-cache python3 make g++

# Copiar package.json primero para cachear dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Crear directorio de datos
RUN mkdir -p /app/data

# Puerto
EXPOSE 3000

# Variables de entorno
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

# Ejecutar
CMD ["node", "server/index.js"]
