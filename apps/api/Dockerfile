FROM node:18.18-alpine AS pruner
WORKDIR /app

# Copy only the files needed for turbo prune
COPY . .
RUN npx turbo prune api --docker

# Base stage for installing dependencies
FROM node:18.18-alpine AS base
WORKDIR /app

# Copy pruned package.json files and install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm clean-install

# Build stage - add source code and build
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
COPY --from=base /app/node_modules /app/node_modules

# Build the project
RUN npm run build --workspace=api

# Development stage - use source code with hot reload
FROM base AS dev
WORKDIR /app
COPY --from=pruner /app/out/full/ .
COPY --from=base /app/node_modules /app/node_modules

EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=api"]

# Production stage (when you're ready for it)
FROM node:18.18-alpine AS production
WORKDIR /app

COPY --from=builder /app/apps/api/dist /app/dist
COPY --from=builder /app/apps/api/package.json /app/package.json
COPY --from=builder /app/apps/api/public /app/public

# Only install production dependencies
ENV NODE_ENV=production
RUN npm clean-install --production

EXPOSE 3000
CMD ["node", "dist/server.js"]

# Default to development stage
FROM dev