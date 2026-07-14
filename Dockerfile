# ==========================================
# STAGE 1 — BUILDER
# ==========================================

FROM node:24-alpine AS builder

WORKDIR /app

# Install build tools
RUN npm install -g @yao-pkg/pkg

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Swagger JSON
RUN npm run swagger:generate

# Build standalone Linux binary
RUN npx @yao-pkg/pkg . \
    --targets node24-linux-x64 \
    --output /app/backend

# ==========================================
# STAGE 2 — RUNTIME
# ==========================================

FROM debian:bookworm-slim

WORKDIR /app

# Runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -r -s /usr/sbin/nologin app

# Create persistent storage directories
RUN mkdir -p /app/backup/tenant-backups /app/log /app/uploads/profile /app/uploads/tenant && \
    chown -R app:app /app/backup /app/log /app/uploads

# Copy binary
COPY --from=builder /app/backend ./backend

# Optional runtime assets
COPY --from=builder /app/swagger.json ./swagger.json

# Environment
ENV NODE_ENV=production
ENV APP_STORAGE_PATH=/app

# Binary permissions
RUN chmod +x ./backend && \
    chown app:app ./backend

# Expose port
EXPOSE 3000

# Run as non-root
USER app

# Start application
CMD ["./backend"]