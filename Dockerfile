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

# Copy configuration files needed for Vite preview server
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/vite.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/tsr.config.json ./

# Install dependencies (Vite is required to execute the preview/Vinxi engine)
RUN npm ci

# Copy client/server build assets
COPY --from=builder /app/dist ./dist

# Create target directories for volume mounts
RUN mkdir -p /movies /data

# Default configurations (can be overridden during docker run)
ENV MOVIES_DIR=/movies
ENV STATE_PATH=/data/state.json
ENV APP_PASSWORD=movies
ENV PORT=3000

# Expose production port
EXPOSE 3000

# Start server using Vite preview, bound to all network interfaces
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]
