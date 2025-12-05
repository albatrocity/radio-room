# Monorepo Deployment Setup - Complete ✅

## Overview

Successfully configured the monorepo for dual deployment:
- **API** (`apps/api`) → Heroku (Docker)
- **Web** (`apps/web`) → Netlify (Static Site)

## Files Created/Modified

### Root Configuration Files

1. **`heroku.yml`** (created)
   - Configures Heroku to build from `apps/api/Dockerfile`
   - Enables Docker-based deployment
   - Must be at repository root for Heroku to detect it

2. **`netlify.toml`** (created)
   - Sets base directory to `apps/web`
   - Configures build command to work with npm workspaces
   - Sets Node version and build environment
   - Includes security headers and caching rules

3. **`DEPLOYMENT.md`** (created)
   - Comprehensive deployment guide
   - Covers both Heroku and Netlify setup
   - Includes troubleshooting section
   - Documents environment variables needed

4. **`DEPLOYMENT_CHECKLIST.md`** (created)
   - Step-by-step checklist for initial setup
   - Covers both services
   - Includes verification steps
   - Lists common issues and solutions

### API Changes

1. **`apps/api/Dockerfile`** (modified)
   - Uncommented production build step: `RUN npx turbo build --filter=api`
   - Ensures TypeScript is compiled before deployment
   - Build now runs automatically on Heroku

2. **`apps/api/heroku.yml`** (deleted)
   - Moved to repository root
   - Heroku requires configuration at root for monorepo

## Deployment Architecture

### Heroku (API)

```
┌─────────────────────────────────────────┐
│  GitHub Push to `main`                  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Heroku Detects heroku.yml at root     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Docker Build Process:                  │
│  1. Turbo prune --filter=api           │
│  2. Install dependencies                │
│  3. Build TypeScript → dist/           │
│  4. Run: node apps/api/dist/server.js  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  API Live at:                           │
│  https://your-app.herokuapp.com         │
└─────────────────────────────────────────┘
```

### Netlify (Web)

```
┌─────────────────────────────────────────┐
│  GitHub Push to `main`                  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Netlify Detects netlify.toml at root  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Build Process:                         │
│  1. cd apps/web (base directory)       │
│  2. cd ../.. && npm install (root)     │
│  3. npm run build --workspace=web       │
│  4. gatsby build → public/             │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│  Site Live at:                          │
│  https://your-site.netlify.app          │
└─────────────────────────────────────────┘
```

## Key Configuration Details

### Heroku Docker Build

The Dockerfile uses Turbo's multi-stage build:

1. **Builder Stage**: Prunes workspace to only API dependencies
2. **Installer Stage**: Installs dependencies and builds
3. **Runner Stage**: Copies built files and runs production server

**Advantages**:
- Smaller image size (only production dependencies)
- Faster builds (cached layers)
- Optimized for monorepo structure

### Netlify Monorepo Build

Build command navigates workspace structure:
```bash
cd ../.. && npm install && npm run build --workspace=web
```

**Why this works**:
- Netlify runs commands from `base` directory (`apps/web`)
- `cd ../..` goes back to repository root
- `npm install` installs all workspace dependencies
- `npm run build --workspace=web` builds only the web app using Turbo

## Environment Variables Required

### Heroku (API)

```bash
# Database & Redis
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Authentication
SESSION_SECRET=random_secret_string

# Spotify OAuth
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=https://your-app.herokuapp.com/auth/spotify/callback

# Optional
NODE_ENV=production
```

### Netlify (Web)

```bash
# API Connection (prefix with GATSBY_ for Gatsby)
GATSBY_API_URL=https://your-app.herokuapp.com
GATSBY_SOCKET_URL=https://your-app.herokuapp.com

# Optional
NODE_ENV=production
```

## Deployment Workflow

### Automatic Deploys (Recommended)

```bash
# Make changes
git add .
git commit -m "Your changes"
git push origin main
```

**Result**:
- ✅ Heroku automatically builds and deploys API
- ✅ Netlify automatically builds and deploys Web
- ✅ Both deployments happen in parallel

### Manual Deploys

**Heroku**:
```bash
git push heroku main
# or
heroku releases:rollback v123 -a your-app-name
```

**Netlify**:
```bash
netlify deploy --prod
# or rollback from dashboard
```

## Testing Locally

### Full Stack
```bash
npm install
npm run dev
```

### Individual Apps
```bash
npm run dev --workspace=api   # API only
npm run dev --workspace=web   # Web only
```

### Docker Build Test (API)
```bash
docker build -f apps/api/Dockerfile -t test-api .
docker run -p 3000:3000 test-api
```

### Gatsby Build Test (Web)
```bash
cd apps/web
npm install
npm run build
npm run serve
```

## Migration Notes

### From Separate Repositories

**Previous Setup**:
- API repo → Heroku (connected directly)
- Web repo → Netlify (connected directly)

**New Setup**:
- Single monorepo → Both services
- Each service builds from its subdirectory
- Configuration files at root coordinate builds

**Breaking Changes**: None! 
- Same build processes
- Same output artifacts
- Same runtime behavior

**What Changed**:
- Build commands adjusted for monorepo structure
- Configuration files moved to root
- Workspace dependencies properly handled

## Verification Steps

### 1. Heroku API Health Check
```bash
curl https://your-app.herokuapp.com/health
# Should return 200 OK
```

### 2. Netlify Site Check
1. Visit your Netlify URL
2. Open browser DevTools → Console
3. Check for API connection errors
4. Test app functionality

### 3. Integration Check
1. Create a new room on Web app
2. Verify API creates the room (check Heroku logs)
3. Test real-time features (WebSocket connection)

## Monitoring

### Heroku
```bash
# View logs
heroku logs --tail -a your-app-name

# Check status
heroku ps -a your-app-name

# View releases
heroku releases -a your-app-name
```

### Netlify
- Dashboard → Deploys (view build logs)
- Dashboard → Functions (if using)
- Analytics (if enabled)

## Rollback Procedures

### Heroku
```bash
# List releases
heroku releases -a your-app-name

# Rollback to previous
heroku rollback -a your-app-name

# Or specific version
heroku rollback v123 -a your-app-name
```

### Netlify
1. Go to Deploys tab
2. Find successful previous deploy
3. Click "Publish deploy"

## Next Steps

1. **Initial Setup**:
   - [ ] Follow `DEPLOYMENT_CHECKLIST.md`
   - [ ] Configure Heroku Docker stack
   - [ ] Configure Netlify build settings
   - [ ] Set environment variables

2. **Test Deployment**:
   - [ ] Push to `main` branch
   - [ ] Monitor Heroku build logs
   - [ ] Monitor Netlify build logs
   - [ ] Verify both apps are live

3. **Optional Enhancements**:
   - [ ] Set up custom domains
   - [ ] Configure SSL certificates
   - [ ] Enable error tracking (Sentry)
   - [ ] Set up monitoring/alerts
   - [ ] Configure review apps (Heroku)
   - [ ] Enable deploy previews (Netlify)

## Support

For detailed instructions:
- See `DEPLOYMENT.md` for comprehensive guide
- See `DEPLOYMENT_CHECKLIST.md` for step-by-step setup

For troubleshooting:
- Check Heroku logs: `heroku logs --tail`
- Check Netlify deploy logs in dashboard
- Verify environment variables are set correctly
- Test Docker build locally
- Test Gatsby build locally

## Success Criteria ✅

- [x] `heroku.yml` at repository root
- [x] `netlify.toml` at repository root
- [x] API Dockerfile builds production code
- [x] Documentation complete
- [x] Migration path from separate repos clear
- [x] No breaking changes to existing deployments

