# Simple Vite development Dockerfile
# Production builds are handled by Netlify
FROM node:22-alpine

WORKDIR /app

# Copy root package files first (changes less frequently)
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/

# Copy only package.json files from packages (for workspace resolution)
# This avoids invalidating npm cache when package source code changes
COPY packages/adapter-shoutcast/package.json ./packages/adapter-shoutcast/
COPY packages/adapter-spotify/package.json ./packages/adapter-spotify/
COPY packages/adapter-tidal/package.json ./packages/adapter-tidal/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/factories/package.json ./packages/factories/
COPY packages/plugin-absent-dj/package.json ./packages/plugin-absent-dj/
COPY packages/plugin-base/package.json ./packages/plugin-base/
COPY packages/plugin-playlist-democracy/package.json ./packages/plugin-playlist-democracy/
COPY packages/plugin-special-words/package.json ./packages/plugin-special-words/
COPY packages/server/package.json ./packages/server/
COPY packages/types/package.json ./packages/types/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/utils/package.json ./packages/utils/

# Install dependencies (cached unless package.json files change)
RUN npm ci

# Now copy source code (volumes will override in docker-compose for hot reload)
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# Set working directory to web app
WORKDIR /app/apps/web

# Expose Vite dev server port
EXPOSE 8000

# Run Vite dev server with host binding for Docker
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8000"]
