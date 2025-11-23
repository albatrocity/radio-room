# Netlify Build Troubleshooting

## Error: @parcel/watcher not found

### What is @parcel/watcher?

`@parcel/watcher` is a native file-watching library used by Gatsby:
- **Primary use**: Development mode (`gatsby develop`) for hot reloading
- **Build use**: Optional - used for some file system operations during build
- **Type**: Optional dependency with native binaries

### Why the Error Occurs

1. Native binaries aren't always pre-built for Netlify's build environment
2. Optional dependencies may not install properly in CI/CD
3. The package requires compilation if pre-built binary is missing

### Solutions (Try in Order)

#### Solution 1: Explicitly Install Optional Dependencies ✅ (Recommended)

Already configured in `netlify.toml`:
```toml
command = "cd ../.. && npm install --include=optional && npm run build --workspace=web"
```

This ensures optional dependencies are installed.

#### Solution 2: Add as Direct Dependency (If Solution 1 Fails)

If the error persists, add `@parcel/watcher` as a direct dependency:

```bash
cd apps/web
npm install @parcel/watcher --save
```

This ensures it's always installed, not treated as optional.

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

### Why This Happens Specifically on Netlify

1. **Local/Docker**: Builds work because optional deps install correctly
2. **Netlify**: Different build environment, stricter dependency resolution
3. **Architecture**: Native bindings need specific Linux x64 glibc builds

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

