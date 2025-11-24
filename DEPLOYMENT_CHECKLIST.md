# Deployment Setup Checklist

Use this checklist to configure your existing Heroku and Netlify apps for monorepo deployment.

## 🔧 Heroku Setup (API)

### 1. Enable Docker Stack

```bash
heroku stack:set container -a your-heroku-app-name
```

### 2. Connect to GitHub Repository

- [ ] Go to Heroku Dashboard → Your App
- [ ] Click **Deploy** tab
- [ ] **Deployment method**: Select "GitHub"
- [ ] **App connected to GitHub**: Search and connect your repository
- [ ] **Automatic deploys**: Enable for `main` branch

### 3. Configure Build Settings

The `heroku.yml` file at the repository root is already configured to:

- Use Docker build from `apps/api/Dockerfile`
- Build with Turbo for optimized dependencies
- Run production build automatically

**No additional Heroku build settings needed!** ✅

### 4. Set Environment Variables

Go to **Settings** → **Config Vars** and add:

```bash
# Database & Cache
DATABASE_URL=your_database_url
REDIS_URL=your_redis_url

# Session
SESSION_SECRET=your_secret_key

# Spotify OAuth
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://your-app.herokuapp.com/auth/spotify/callback

# Optional
NODE_ENV=production
```

### 5. Test Deployment

```bash
# Trigger a manual deploy
git push origin main

# Monitor logs
heroku logs --tail -a your-heroku-app-name
```

---

## 🌐 Netlify Setup (Web)

### 1. Update Site Build Settings

Go to **Site settings** → **Build & deploy** → **Build settings**

- [ ] **Base directory**: `apps/web`
- [ ] **Build command**: `cd ../.. && npm install && npm run build --workspace=web`
- [ ] **Publish directory**: `apps/web/public`

**Alternative**: Netlify should automatically detect the `netlify.toml` configuration ✅

### 2. Configure Node Version

Go to **Site settings** → **Build & deploy** → **Environment**

- [ ] **Environment variables**: Add `NODE_VERSION` = `18`
- [ ] **Environment variables**: Add `NPM_VERSION` = `10.9.2`

Or Netlify will use the versions from `netlify.toml` ✅

### 3. Set Environment Variables

Go to **Site settings** → **Build & deploy** → **Environment variables**

```bash
# API Connection (REQUIRED)
GATSBY_API_URL=https://your-heroku-app.herokuapp.com
GATSBY_SOCKET_URL=https://your-heroku-app.herokuapp.com

# Optional
NODE_ENV=production
```

⚠️ **Important**: Gatsby requires environment variables to be prefixed with `GATSBY_`

### 4. Configure Deploy Settings

Go to **Site settings** → **Build & deploy** → **Continuous Deployment**

- [ ] **Branch deploys**: Ensure `main` branch is set to deploy automatically
- [ ] **Deploy contexts**:
  - Production branch: `main`
  - Deploy previews: Enable for pull requests (optional)

### 5. Test Deployment

```bash
# Trigger a deploy
git push origin main

# Or manually trigger from Netlify
# Go to Deploys → Trigger deploy → Deploy site
```

---

## ✅ Verification

### Check Heroku API

```bash
# Check if API is running
curl https://your-heroku-app.herokuapp.com/health

# Or open in browser
heroku open -a your-heroku-app-name
```

### Check Netlify Web

1. Open your Netlify site URL
2. Verify the site loads correctly
3. Check browser console for any API connection errors
4. Test creating a room or logging in

---

## 🚨 Common Issues

### Heroku: "No web process running"

**Solution**: Verify `heroku.yml` is at repository root (not in `apps/api/`)

### Heroku: "Build failed"

**Solution**:

1. Check that Docker stack is enabled: `heroku stack -a your-app-name`
2. Verify build logs for specific error
3. Test Docker build locally:
   ```bash
   docker build -f apps/api/Dockerfile .
   ```

### Netlify: "Dependency not found"

**Solution**: Verify build command installs from root:

```bash
cd ../.. && npm install && npm run build --workspace=web
```

### Netlify: "GATSBY_API_URL undefined"

**Solution**:

1. Add `GATSBY_API_URL` to environment variables
2. Trigger a new deploy (environment changes require rebuild)

### Both: "Deploy succeeds but app doesn't work"

**Solution**:

1. Check environment variables are set correctly
2. Verify the API URL in Netlify matches your Heroku app URL
3. Check CORS settings if getting cross-origin errors

---

## 📝 Post-Deployment

### Update Documentation

- [ ] Update README with your specific Heroku app URL
- [ ] Update README with your specific Netlify site URL
- [ ] Document any additional environment variables you added

### Set Up Monitoring

- [ ] Enable Heroku metrics (if using paid dyno)
- [ ] Set up Netlify analytics (optional)
- [ ] Configure error tracking (e.g., Sentry)

### Configure Custom Domain (Optional)

**Netlify**:

- Go to **Domain settings** → **Add custom domain**

**Heroku**:

```bash
heroku domains:add www.yourdomain.com -a your-app-name
```

---

## 🎉 Done!

Your monorepo is now configured for automatic deployments:

- ✅ Pushing to `main` deploys API to Heroku
- ✅ Pushing to `main` deploys Web to Netlify
- ✅ Both deployments are independent but coordinated

For detailed deployment documentation, see [DEPLOYMENT.md](./DEPLOYMENT.md)
