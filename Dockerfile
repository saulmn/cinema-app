# ==========================================
# Stage 1: Build Environment
# ==========================================
FROM node:22-slim AS builder
WORKDIR /app

# Copy lock files and install all dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source code and compile routes + build application
COPY . .
RUN npm run generate-routes
RUN npm run build

# ==========================================
# Stage 2: Production Runtime Environment
# ==========================================
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copiamos archivos de configuración y proyecto completos
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/vite.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/tsr.config.json ./
COPY --from=builder /app/src ./src

# 💡 CORRECCIÓN CLAVE: El flag --include=dev fuerza la instalación de plugins de Vite
RUN npm ci --include=dev

# Copiamos el build previamente compilado
COPY --from=builder /app/dist ./dist

# Creamos carpetas de volúmenes
RUN mkdir -p /movies /data

# Variables de entorno predeterminadas
ENV MOVIES_DIR=/movies
ENV STATE_PATH=/data/state.json
ENV APP_PASSWORD=movies
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
