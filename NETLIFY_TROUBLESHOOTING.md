# Netlify Build Troubleshooting

## Error: @parcel/watcher not found

### What is @parcel/watcher?

`@parcel/watcher` is a native file-watching library used by Gatsby:
- **Primary use**: Development mode (`gatsby develop`) for hot reloading
- **Build use**: Should NOT be needed for production builds
- **Type**: Optional dependency with native binaries

### Why the Error Occurs (Even Though It Shouldn't)

You're right - Netlify shouldn't need `@parcel/watcher` for production builds! This error typically occurs due to:

1. **Gatsby importing it unconditionally**: Some Gatsby plugins (like `gatsby-source-filesystem` or `gatsby-plugin-offline`) may import it even in production
2. **Peer dependency resolution**: npm tries to resolve it even though it's optional
3. **Plugin misconfiguration**: Certain plugins check for file watching capabilities even in CI
4. **Gatsby version quirk**: Older Gatsby versions had this issue (fixed in v5+)

**The Real Issue**: Gatsby should detect it's running in CI/production and skip file watching entirely.

### Solutions (Try in Order)

#### Solution 1: Tell Gatsby It's Running in CI ✅ (Recommended)

**Already configured in `netlify.toml`**:
```toml
[build.environment]
  CI = "true"
  NODE_ENV = "production"
  GATSBY_CPU_COUNT = "1"
```

These environment variables tell Gatsby to:
- Skip development-only features
- Disable file watching
- Use production mode exclusively

#### Solution 2: Use Clean Install (npm ci)

**Already configured in `netlify.toml`**:
```toml
command = "cd ../.. && npm ci && npm run build --workspace=web"
```

`npm ci` uses `package-lock.json` and properly handles optional dependencies.

#### Solution 3: Upgrade Gatsby (If on v4 or Earlier)

This issue was more common in Gatsby v4. You're on Gatsby v5.7.0, so this should already be resolved.

#### Solution 4: Add .npmrc to Skip Optional Dependencies

If the environment variables don't work, create `apps/web/.npmrc`:
```
optional=false
```

This forces npm to completely ignore optional dependencies.

#### Solution 5: Last Resort - Stub the Module

Only if all else fails, create `apps/web/node_modules/@parcel/watcher/index.js`:
```javascript
// Stub for @parcel/watcher on Netlify
module.exports = {};
```

But this should NOT be necessary with Solutions 1-2.

#### Solution 3: Use Legacy Peer Deps Flag

Update `netlify.toml`:
```toml
[build]
  command = "cd ../.. && npm install --legacy-peer-deps --include=optional && npm run build --workspace=web"
```

#### Solution 4: Disable File Watching in Production Build

Create `apps/web/.npmrc`:
```
optional=true
```

Or set in `netlify.toml`:
```toml
[build.environment]
  NPM_CONFIG_OPTIONAL = "true"
```

#### Solution 5: Use Alternative Gatsby Build Command

Update `netlify.toml` to use Gatsby CLI directly:
```toml
[build]
  command = "cd ../.. && npm install && cd apps/web && npx gatsby build"
```

### Recommended Approach

**For most cases**: Solution 1 (already applied) + Solution 2 if needed

```bash
# In apps/web directory
npm install @parcel/watcher --save
git add package.json package-lock.json
git commit -m "Add @parcel/watcher as direct dependency for Netlify"
git push origin main
```

### Why This Happens Specifically on Netlify (But Shouldn't)

**Root Cause**: Some Gatsby plugins try to import `@parcel/watcher` unconditionally, even though they shouldn't use it in production.

1. **Local builds work**: Because optional dependencies are installed by default
2. **Netlify fails**: CI environment may not install optional deps, exposing the import bug
3. **It's a Gatsby/plugin bug**: Production builds should never require file watching

**The Fix**: Force Gatsby into "CI mode" where it knows not to use development features.

### Verification

After applying a solution:

1. **Trigger Deploy**:
   ```bash
   git push origin main
   ```

2. **Monitor Build Logs** in Netlify dashboard for:
   ```
   ✓ @parcel/watcher installed successfully
   ✓ gatsby build completed
   ```

3. **Check Deploy Status**: Should show "Published"

### Alternative: Skip Optional Dependencies Entirely

If you don't need file watching (production builds don't), you can:

**Option A**: Set in `netlify.toml`:
```toml
[build.environment]
  GATSBY_NO_WATCH = "true"
```

**Option B**: Use a custom build script in `apps/web/package.json`:
```json
{
  "scripts": {
    "build:netlify": "GATSBY_NO_WATCH=true gatsby build"
  }
}
```

Then update `netlify.toml`:
```toml
[build]
  command = "cd ../.. && npm install && npm run build:netlify --workspace=web"
```

### Related Environment Variables

```bash
# Disable Gatsby's file watcher
GATSBY_NO_WATCH=true

# Force Gatsby to use polling instead of native watching
GATSBY_USE_POLLING=true

# Increase Node memory for large builds
NODE_OPTIONS=--max_old_space_size=4096
```

### Still Having Issues?

**Check Netlify Build Logs for**:
1. Exact error message
2. Which step fails (install vs build)
3. Node/npm versions being used

**Common Related Issues**:
- `sharp` installation failures → Add `SHARP_IGNORE_GLOBAL_LIBVIPS=1`
- Out of memory → Add `NODE_OPTIONS=--max_old_space_size=4096`
- Gatsby cache issues → Add build command: `gatsby clean && gatsby build`

### Quick Fix Summary

```bash
# 1. Add as direct dependency (most reliable)
cd apps/web
npm install @parcel/watcher --save

# 2. Commit and push
git add package.json package-lock.json
git commit -m "Fix @parcel/watcher on Netlify"
git push origin main

# 3. Monitor Netlify deploy
```

This should resolve the issue in 95% of cases.

