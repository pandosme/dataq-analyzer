# ============================================
# Stage 1: Build Web UI
# ============================================
FROM node:20-alpine AS web-builder

WORKDIR /app/web

# Copy web package files
COPY web/package*.json ./
RUN npm ci

# Copy web source code and build
COPY web/ ./
RUN npm run build

# ============================================
# Stage 2: Production Runtime
# ============================================
FROM node:20-alpine

# Install ffmpeg for video playback processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy backend source code
COPY src/ ./src/
COPY public/ ./public/
COPY config.yaml ./config.yaml

# Copy built web UI from builder stage
COPY --from=web-builder /app/web/dist ./dist/web

# Create logs directory
RUN mkdir -p /app/logs && chown -R node:node /app

# Switch to non-root user
USER node

# Default port (internal)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:80/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "src/server.js"]
