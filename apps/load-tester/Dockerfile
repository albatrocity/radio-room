# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY turbo.json ./

# Copy package sources
COPY packages/types ./packages/types
COPY packages/factories ./packages/factories
COPY packages/typescript-config ./packages/typescript-config
COPY apps/load-tester ./apps/load-tester

# Install dependencies
RUN npm ci

# Build the load-tester
RUN npm run build -w apps/load-tester

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Copy built files and production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/load-tester/dist ./dist
COPY --from=builder /app/apps/load-tester/package.json ./package.json

# Create scenarios directory
RUN mkdir -p /app/scenarios

ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]

