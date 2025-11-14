# Docker Build Fix - Package Name Resolution

## The Problem

Docker build was failing with:

```
npm error 404 Not Found - GET https://registry.npmjs.org/@repo%2fadapter-shoutcast
npm error 404  '@repo/adapter-shoutcast@*' is not in this registry.
```

## Root Cause

**Package name mismatch!** The Shoutcast adapter package is actually named:
- ✅ `@repo/media-source-shoutcast` (actual package name)
- ❌ `@repo/adapter-shoutcast` (what we were trying to import)

## What Was Fixed

### 1. Fixed Package Reference in API

**File:** `apps/api/package.json`

```diff
  "dependencies": {
    "@repo/server": "*",
    "@repo/adapter-spotify": "*",
-   "@repo/adapter-shoutcast": "*",
+   "@repo/media-source-shoutcast": "*",
    "ts-node": "^10.9.2"
  }
```

### 2. Fixed Import in Server Code

**File:** `apps/api/src/server.ts`

```diff
  import { createServer } from "@repo/server"
  import { playbackController, metadataSource, createSpotifyAuthRoutes } from "@repo/adapter-spotify"
- import { mediaSource } from "@repo/adapter-shoutcast"
+ import { mediaSource } from "@repo/media-source-shoutcast"
  import { getUserServiceAuth } from "@repo/server/operations/data"
```

### 3. Fixed Package Entry Points

Both adapter packages had `"main": "index.js"` but the files are TypeScript:

**Files:**
- `packages/adapter-spotify/package.json`
- `packages/adapter-shoutcast/package.json`

```diff
- "main": "index.js",
- "type": "module",
+ "main": "index.ts",
```

Removed `"type": "module"` since we're working with TypeScript and the module system is handled by the transpiler.

## Package Names Reference

For future reference, here are the correct package names:

| Package Directory | Actual Package Name | Purpose |
|------------------|---------------------|---------|
| `packages/adapter-spotify/` | `@repo/adapter-spotify` | Spotify PlaybackController + MetadataSource |
| `packages/adapter-shoutcast/` | `@repo/media-source-shoutcast` | Shoutcast MediaSource |
| `packages/server/` | `@repo/server` | Core server with adapter system |
| `packages/types/` | `@repo/types` | Shared TypeScript types |

## Now It Should Work

```bash
# Clean build
docker-compose down -v
docker-compose up --build

# Should complete successfully!
```

## Why This Happened

The package was originally named `@repo/media-source-shoutcast` (probably to distinguish it as a media source vs other adapter types), but when I added it to the API dependencies, I incorrectly assumed it was named `@repo/adapter-shoutcast` to match the directory name.

## Prevention

To avoid this in the future:
1. Always check `package.json` `"name"` field before adding dependencies
2. Consider renaming packages to match their directory names for consistency
3. Run `npm install` locally before Docker build to catch these early

