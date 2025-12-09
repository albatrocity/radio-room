# Deployment Guide

This monorepo contains two deployable applications:

- **API** (`apps/api`) - Deploys to Heroku
- **Web** (`apps/web`) - Deploys to Netlify

## Architecture

```
radio-room/
├── apps/
│   ├── api/          → Heroku
│   └── web/          → Netlify
├── packages/
│   ├── server/
│   ├── adapter-spotify/
│   └── ...
├── heroku.yml        → Heroku build config
└── netlify.toml      → Netlify build config
```

## Heroku Deployment (API)

### Initial Setup

1. **Connect your Heroku app to GitHub:**

   ```bash
   # Login to Heroku
   heroku login

   # Connect your existing Heroku app
   heroku git:remote -a your-heroku-app-name
   ```

2. **Configure the stack to use Docker:**

   ```bash
   heroku stack:set container -a your-heroku-app-name
   ```

3. **Set up automatic deploys:**
   - Go to your Heroku app dashboard
   - Navigate to the "Deploy" tab
   - Connect to GitHub
   - Enable "Automatic Deploys" from the `main` branch

### Configuration

- **Build config**: `heroku.yml` (at repo root)
- **Dockerfile**: `apps/api/Dockerfile`
- **Build process**:
  1. Uses Turbo's `prune` to extract only API dependencies
  2. Installs dependencies
  3. Builds the TypeScript code (`npx turbo build --filter=api`)
  4. Runs `node apps/api/dist/server.js`

### Environment Variables

Set these in your Heroku app settings:

```bash
# Required
DATABASE_URL=<your-database-url>
REDIS_URL=<your-redis-url>
SESSION_SECRET=<your-session-secret>
SPOTIFY_CLIENT_ID=<your-spotify-client-id>
SPOTIFY_CLIENT_SECRET=<your-spotify-client-secret>

# Optional
NODE_ENV=production
PORT=3000 (Heroku sets this automatically)
```

### Manual Deploy

```bash
# Deploy to Heroku
git push heroku main

# View logs
heroku logs --tail -a your-heroku-app-name
```

## Netlify Deployment (Web)

### Initial Setup

1. **Connect your Netlify site to GitHub:**
   - Go to Netlify dashboard
   - Click "Add new site" → "Import an existing project"
   - Choose GitHub and select your repository
   - Netlify should auto-detect the `netlify.toml` configuration

2. **Or use Netlify CLI:**

   ```bash
   # Install Netlify CLI
   npm install -g netlify-cli

   # Login
   netlify login

   # Link to existing site
   netlify link
   ```

### Configuration

- **Build config**: `netlify.toml` (at repo root)
- **Base directory**: `apps/web`
- **Build command**: `cd ../.. && npm install && npm run build --workspace=web`
- **Publish directory**: `apps/web/public`
- **Node version**: 18.x

### Environment Variables

Set these in your Netlify site settings (Site settings → Build & deploy → Environment variables):

```bash
# Optional
NODE_ENV=production
```

### Build Settings Override

If Netlify doesn't pick up the `netlify.toml`, manually configure:

1. **Base directory**: `apps/web`
2. **Build command**: `cd ../.. && npm install && npm run build --workspace=web`
3. **Publish directory**: `apps/web/public`

### Manual Deploy

```bash
# Deploy to Netlify
netlify deploy --prod

# Or via Git
git push origin main  # Automatic deploy configured
```

## Deployment Workflow

### Automatic Deployments

When you push to `main`:

```bash
git add .
git commit -m "Your changes"
git push origin main
```

This triggers:

1. ✅ **Heroku** - Builds and deploys API automatically
2. ✅ **Netlify** - Builds and deploys Web automatically

### Preview Deployments

**Netlify** (automatic on PRs):

- Each pull request gets a unique preview URL
- Preview deploys are automatic

**Heroku** (manual):

```bash
# Create a review app in Heroku dashboard or
# Use pipeline feature for PR previews
```

## Troubleshooting

### Heroku Issues

**Build fails:**

```bash
# Check Heroku build logs
heroku logs --tail -a your-app-name

# Verify Docker build locally
cd apps/api
docker build -t test-api -f Dockerfile ../..
```

**App doesn't start:**

- Ensure `PORT` environment variable is not hardcoded
- Check that `apps/api/dist/server.js` exists after build
- Verify all required environment variables are set

### Netlify Issues

**Build fails:**

- Check build logs in Netlify dashboard
- Verify Node version matches (`NODE_VERSION = "18"`)
- Test build locally:
  ```bash
  cd apps/web
  npm install
  npm run build
  ```

**Dependencies not found:**

- Ensure build command installs from root: `cd ../.. && npm install`
- Check that workspace packages are properly linked

**Environment variables not working:**

- Gatsby requires variables to be prefixed with `GATSBY_`
- Rebuild the site after adding environment variables

## Monitoring

### Heroku

```bash
# View logs
heroku logs --tail -a your-app-name

# Check app status
heroku ps -a your-app-name

# Open app
heroku open -a your-app-name
```

### Netlify

```bash
# View recent deploys
netlify deploys

# Open site
netlify open:site
```

## Rollback

### Heroku

```bash
# Rollback to previous release
heroku releases -a your-app-name
heroku rollback v123 -a your-app-name
```

### Netlify

- Go to Deploys tab in Netlify dashboard
- Click "Publish deploy" on any previous successful deploy

## Local Development

```bash
# Install dependencies
npm install

# Run both apps in development
npm run dev

# Run specific app
npm run dev --workspace=api
npm run dev --workspace=web
```

## Additional Resources

- [Heroku Docker Deploys](https://devcenter.heroku.com/articles/build-docker-images-heroku-yml)
- [Netlify Monorepo Guide](https://docs.netlify.com/configure-builds/monorepos/)
- [Turbo Documentation](https://turbo.build/repo/docs)
