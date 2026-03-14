FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/mcp-server/package.json ./packages/mcp-server/
RUN npm ci -w packages/mcp-server

COPY packages/mcp-server/tsconfig.json ./packages/mcp-server/
COPY packages/mcp-server/src/ ./packages/mcp-server/src/
RUN npm run -w packages/mcp-server build

FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/mcp-server/package.json ./packages/mcp-server/
RUN npm ci -w packages/mcp-server --omit=dev

COPY --from=build /app/packages/mcp-server/dist/ ./packages/mcp-server/dist/
WORKDIR /app/packages/mcp-server

ENTRYPOINT ["node", "dist/index.js"]
