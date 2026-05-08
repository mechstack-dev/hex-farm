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

# Create a directory for persistent world data
RUN mkdir -p /app/server/data

# The application listens on port 3001 by default
EXPOSE 3001

# Set the environment to production
ENV NODE_ENV=production
ENV PORT=3001

# Start the server
CMD ["npm", "run", "start", "--workspace=server"]
