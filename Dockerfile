# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy root and workspace package files
COPY package*.json ./
COPY common/package*.json ./common/
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install all dependencies (including devDependencies for building)
RUN npm install

# Copy source code
COPY . .

# Build all workspaces
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy root and workspace package files for production dependency installation
COPY package*.json ./
COPY common/package*.json ./common/
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install only production dependencies
RUN npm install --omit=dev

# Copy built artifacts from the builder stage
COPY --from=builder /app/common/dist ./common/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Persistent world data lives here (mount a volume to keep it across runs).
RUN mkdir -p /app/server/data
VOLUME ["/app/server/data"]

# The single server process serves BOTH the realtime API and the built
# client (client/dist) on one port.
EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

# Liveness: the server answers HTTP on / (it serves the client there).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Start the server (serves client + realtime on :3001).
CMD ["npm", "run", "start", "--workspace=server"]
