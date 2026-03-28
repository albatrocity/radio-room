FROM node:22-bookworm-slim

WORKDIR /app

# Copy root package files first (changes less frequently)
COPY package*.json ./
COPY apps/scheduler/package*.json ./apps/scheduler/

# Copy only package.json files from packages (for workspace resolution)
COPY packages/adapter-shoutcast/package.json ./packages/adapter-shoutcast/
COPY packages/adapter-spotify/package.json ./packages/adapter-spotify/
COPY packages/adapter-tidal/package.json ./packages/adapter-tidal/
COPY packages/auth/package.json ./packages/auth/
COPY packages/db/package.json ./packages/db/
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

RUN ROLLUP_VER=$(node -p "require('./node_modules/rollup/package.json').optionalDependencies['@rollup/rollup-linux-arm64-gnu']") && \
  npm install "@rollup/rollup-linux-arm64-gnu@${ROLLUP_VER}" "@rollup/rollup-linux-x64-gnu@${ROLLUP_VER}" --no-save

# Copy source code (volumes will override in docker-compose for hot reload)
COPY packages/ ./packages/
COPY apps/scheduler/ ./apps/scheduler/

WORKDIR /app/apps/scheduler

EXPOSE 8001

CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "8001"]
