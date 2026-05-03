FROM node:22-alpine AS build

WORKDIR /app

# Install build dependencies cache layer early
COPY package.json package-lock.json ./
COPY packages/mcp-server/package.json ./packages/mcp-server/
RUN npm ci -w packages/mcp-server

# Copy source for compilation
COPY packages/mcp-server/tsconfig.json ./packages/mcp-server/
COPY packages/mcp-server/src/ ./packages/mcp-server/src/
RUN npm run -w packages/mcp-server build

FROM node:22-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -S appuser

# Copy package files and install production dependencies
COPY package.json package-lock.json ./
COPY packages/mcp-server/package.json ./packages/mcp-server/
RUN npm ci -w packages/mcp-server --omit=dev

# Copy built artifacts from builder
COPY --from=build /app/packages/mcp-server/dist/ ./packages/mcp-server/dist/

# Set ownership
RUN chown -R appuser:appgroup /app
USER appuser

WORKDIR /app/packages/mcp-server

ENTRYPOINT ["node", "dist/index.js"]
