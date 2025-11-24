FROM node:22-alpine AS base

FROM base AS builder
RUN apk update
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
RUN npm i turbo --global
COPY . .
RUN turbo prune api --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk update
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=builder /app/out/json/ .
RUN npm install

# Build the project and its dependencies
COPY --from=builder /app/out/full/ .
RUN npx turbo build --filter=api

FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
USER nodejs

# Copy application source and dependencies
COPY --from=installer --chown=nodejs:nodejs /app/apps/api ./apps/api
COPY --from=installer --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=installer --chown=nodejs:nodejs /app/packages ./packages
COPY --from=installer --chown=nodejs:nodejs /app/package.json ./package.json

EXPOSE 3000

# For production, use the built version
# For development, docker-compose will override this with ts-node-dev
CMD ["node", "apps/api/dist/server.js"]