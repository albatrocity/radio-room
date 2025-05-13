FROM node:18 AS pruner
WORKDIR /app

# Copy only the files needed for turbo prune
COPY . .
RUN npm install -g turbo
RUN turbo prune web --docker

# Base stage for installing dependencies
FROM node:18 AS base
WORKDIR /app

# Install build essentials for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy pruned package.json files and install
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

# Install dependencies with explicit build options for native modules
ENV PARCEL_WORKERS=0
ENV GATSBY_CPU_COUNT=1
RUN npm clean-install --build-from-source

# Development stage with hot reload
FROM base AS dev
WORKDIR /app

# Copy full source code for development
COPY --from=pruner /app/out/full/ .
COPY --from=base /app/node_modules /app/node_modules

# Make sure all native modules are properly built
ENV PARCEL_WORKERS=0
ENV GATSBY_CPU_COUNT=1
ENV GATSBY_EXPERIMENTAL_PARALLEL_QUERY_RUNNING=false
ENV GATSBY_SKIP_COMPATIBILITY_CHECK=1

# Add explicit node-gyp config for ARM64
RUN if [ "$(uname -m)" = "aarch64" ]; then \
        npm rebuild @parcel/watcher --build-from-source; \
    fi

# Install Gatsby CLI
RUN npm install -g gatsby-cli

# Set working directory to web app
WORKDIR /app/apps/web

# Expose port for Gatsby develop
EXPOSE 8000
EXPOSE 9000

# Run Gatsby in develop mode with host set to 0.0.0.0 to allow external connections
CMD ["gatsby", "develop", "--host", "0.0.0.0", "--port", "8000"]

# Production stage
FROM base AS build
WORKDIR /app

# Copy source code and installed dependencies
COPY --from=pruner /app/out/full/ .
COPY --from=base /app/node_modules /app/node_modules

# Build the Gatsby site
WORKDIR /app/apps/web
RUN npm run build

# Runner stage for production
FROM node:18-slim AS runner
WORKDIR /app

# Install serve to run the static site
RUN npm install -g serve

# Copy built files
COPY --from=build /app/apps/web/public /app/public

EXPOSE 8000
CMD ["serve", "-s", "/app/public", "-p", "8000"]

# Default to development stage
FROM dev