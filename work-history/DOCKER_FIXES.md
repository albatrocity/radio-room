# Docker Configuration Fixes

## Issues Found and Fixed

### 1. API Dockerfile Issues ❌ → ✅

**Before:**
- Wrong build context (expected monorepo root, but compose.yml used `./apps/api`)
- Missing build dependencies (python3, make, g++ for native modules)
- Wrong CMD path: `apps/api/dist/index.js` (file doesn't exist)
- Didn't copy necessary packages folder to runner stage

**After:**
- Fixed to expect monorepo root context
- Added build dependencies to all stages
- Corrected CMD to `apps/api/dist/server.js`
- Properly copies all required files to runner stage
- Uses `--filter=api` for targeted turbo build

### 2. API package.json Issues ❌ → ✅

**Before:**
- No `build` script (TypeScript compilation)
- No `start` script for production
- Missing `@repo/adapter-shoutcast` dependency
- Missing `typescript` and `ts-node-dev` dev dependencies

**After:**
- Added `build: tsc` script
- Added `start: node dist/server.js` script
- Added missing adapter and TypeScript dependencies
- Moved `ts-node` to dependencies for Docker dev mode

### 3. compose.yml Issues ❌ → ✅

**Before:**
- API build context was `./apps/api` (should be root for turbo prune)
- Only mounted `src` directory (needed all packages)
- Missing critical environment variables (Spotify credentials, Redis URL)
- No development command override

**After:**
- Changed build context to `.` (monorepo root)
- Added proper Dockerfile path: `./apps/api/Dockerfile`
- Mounted both `apps/api/src` and `packages` for hot reload
- Added all required environment variables:
  - `REDIS_URL`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
  - `SPOTIFY_REDIRECT_URI`, `APP_URL`, `SESSION_SECRET`
- Added command override for dev mode: `ts-node-dev`
- Set build target to `installer` for faster dev builds

### 4. Missing Configuration Files ❌ → ✅

**Created:**
- `apps/api/tsconfig.json` - TypeScript compilation config
- `.env.example` - Environment variable template
- `apps/api/.gitignore` - Ignore dist and env files
- `DOCKER_SETUP.md` - Complete setup instructions

## New Docker Architecture

### Build Stages

**API Dockerfile:**
1. **builder** - Prunes monorepo with turbo
2. **installer** - Installs deps and builds (used for dev)
3. **runner** - Production-ready minimal image

### Service Communication

```
Web (8000) ──→ API (3000) ──→ Redis (6379)
     ↓              ↓
 Hot reload   Hot reload
```

### Volume Mounts for Development

**API:**
- Source: `./apps/api/src` → `/app/apps/api/src`
- Packages: `./packages` → `/app/packages`

**Web:**
- Source: `./apps/web/src` → `/app/apps/web/src`
- Public: `./apps/web/public` → `/app/apps/web/public`
- Gatsby configs

### Environment Variables Required

```env
# Required for Spotify OAuth
SPOTIFY_CLIENT_ID=<from Spotify Dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify Dashboard>
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback

# App configuration
APP_URL=http://localhost:8000
REDIS_URL=redis://redis:6379
SESSION_SECRET=<random string>

# Server config
PORT=3000
ENVIRONMENT=development
```

## Testing the Fixes

### 1. Build and Run

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your Spotify credentials

# Start services
docker-compose up --build
```

### 2. Verify Services

```bash
# API should respond
curl http://localhost:3000/me

# Redis should respond
docker-compose exec redis redis-cli ping

# Web should be accessible
open http://localhost:8000
```

### 3. Test Hot Reload

```bash
# Edit apps/api/src/server.ts
# Watch for automatic reload in logs
docker-compose logs -f api
```

## Migration Notes

If you were running the old setup:

1. Stop all containers: `docker-compose down -v`
2. Remove old images: `docker-compose rm -f`
3. Pull latest code
4. Create `.env` from `.env.example`
5. Rebuild: `docker-compose up --build`

## Known Limitations

1. **First build is slow** - Turbo prune + full npm install
   - Subsequent builds use Docker cache
2. **Hot reload for packages** - Requires container restart
   - Only app-level changes auto-reload
3. **Node version mismatch** - API uses Node 22, Web uses Node 18
   - This is intentional per workspace requirements

## Next Steps

1. Add health checks to docker-compose
2. Add docker-compose.prod.yml for production
3. Consider multi-arch builds for ARM/x64
4. Add Redis persistence configuration
5. Add logging volume mounts

