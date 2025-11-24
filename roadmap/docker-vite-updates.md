# Docker Configuration Updates for Vite Migration

## Changes Made

### compose.yml
**Removed:**
- Gatsby config file volume mounts (gatsby-browser.js, gatsby-config.js, gatsby-node.js, gatsby-ssr.js)
- Port 9000 (Gatsby websocket)
- Gatsby-specific environment variables:
  - GATSBY_WEBPACK_PUBLICPATH
  - PARCEL_WORKERS
  - GATSBY_CPU_COUNT
  - GATSBY_EXPERIMENTAL_PARALLEL_QUERY_RUNNING
  - GATSBY_SKIP_COMPATIBILITY_CHECK
  - GATSBY_API_URL

**Added:**
- Vite config file volume mounts (index.html, vite.config.ts)
- VITE_API_URL environment variable

### apps/web/Dockerfile
**Removed:**
- Gatsby CLI installation
- @parcel/watcher rebuild logic
- Gatsby-specific environment variables
- Port 9000 exposure
- gatsby develop command

**Added:**
- Vite dev server command: `npm run dev -- --host 0.0.0.0 --port 8000`
- Updated build output directory from `public/` to `dist/`

## Usage

```bash
# Rebuild containers with the new configuration
docker compose up --build

# Or if you have existing volumes/containers
docker compose down
docker compose up --build
```

## Key Differences

1. **Dev Server:** Now uses Vite's dev server instead of Gatsby develop
2. **Build Output:** Changed from `public/` to `dist/`
3. **Environment Variables:** Prefix changed from `GATSBY_*` to `VITE_*`
4. **Ports:** Only uses port 8000 (removed Gatsby's websocket port 9000)
5. **No Special Native Builds:** Removed @parcel/watcher rebuilding logic

## Verification

After running `docker compose up --build`, verify:
- [ ] Web container starts successfully
- [ ] Vite dev server is accessible at http://localhost:8000
- [ ] Hot module replacement works when editing files in `apps/web/src/`
- [ ] API is accessible at http://localhost:3000

