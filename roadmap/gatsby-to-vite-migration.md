# Gatsby to Vite + TanStack Router Migration Plan

## Overview
Migrate the `@web` app from Gatsby to Vite with TanStack Router for simplified build tooling and better production reliability.

## Goals
- Replace Gatsby with Vite for faster builds and simpler configuration
- Replace Gatsby's routing and @reach/router with TanStack Router (file-based)
- Remove PWA functionality for simplicity
- Maintain all existing features and functionality
- Improve Netlify deployment reliability

## Current Structure Analysis

### Pages (9 total)
- `/` - index.tsx (Lobby)
- `/about` - about.tsx
- `/callback` - callback.tsx (OAuth)
- `/login` - login.tsx
- `/logout` - logout.tsx
- `/privacy` - privacy.tsx
- `/404` - 404.tsx
- `/rooms/:roomId` - rooms/[...].tsx (uses @reach/router internally)
- `/rooms/create` - rooms/create.tsx

### Gatsby Dependencies to Remove
- gatsby
- gatsby-plugin-netlify
- gatsby-source-filesystem
- gatsby-transformer-sharp
- gatsby-plugin-sharp
- gatsby-plugin-image
- gatsby-plugin-manifest
- gatsby-plugin-google-fonts
- gatsby-plugin-offline
- @reach/router (used within Gatsby pages)

### Gatsby-Specific Patterns to Replace
- `import { navigate } from "gatsby"` → TanStack Router navigation
- `import { graphql, HeadProps } from "gatsby"` → Remove GraphQL queries
- `export function Head()` → HTML head management
- `gatsby-browser.js` / `gatsby-ssr.js` → Vite entry point
- Environment variables: `GATSBY_*` → `VITE_*`

## Implementation Plan

### Phase 1: Setup Vite Infrastructure

**Files to Create:**
- `apps/web/vite.config.ts` - Vite configuration
- `apps/web/index.html` - HTML entry point
- `apps/web/src/main.tsx` - React entry point
- `apps/web/src/routes/__root.tsx` - TanStack Router root layout

**Configuration:**
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite(), // Must be before react()
    react(),
  ],
  server: {
    port: 8000,
    host: '0.0.0.0',
  },
  envPrefix: 'VITE_',
})
```

**Dependencies to Add:**
- vite
- @vitejs/plugin-react
- @tanstack/react-router
- @tanstack/router-plugin (for file-based routing)
- @tanstack/router-devtools (dev only)

### Phase 2: Convert Pages to TanStack Router Routes

**New Directory Structure:**
```
apps/web/src/
├── routes/
│   ├── __root.tsx         # Root layout with ChakraProvider
│   ├── index.tsx          # / (Lobby)
│   ├── about.tsx          # /about
│   ├── callback.tsx       # /callback
│   ├── login.tsx          # /login
│   ├── logout.tsx         # /logout
│   ├── privacy.tsx        # /privacy
│   ├── rooms/
│   │   ├── $roomId.tsx    # /rooms/:roomId (dynamic)
│   │   └── create.tsx     # /rooms/create
│   └── 404.tsx            # Catch-all 404
```

**Key Conversions:**

1. **Root Layout** (`__root.tsx`):
   - Wrap with ChakraProvider (from gatsby-browser.js)
   - Add HTML head management
   - Render `<Outlet />` for child routes

2. **Index Route** (`index.tsx`):
   - Remove `graphql` query (use static metadata)
   - Remove `Head` export (use TanStack Router's head management)
   - Keep `useOAuthCallback()` hook

3. **Room Route** (`rooms/$roomId.tsx`):
   - Replace `@reach/router` with TanStack Router params
   - Use `useParams()` to get `roomId`
   - Remove internal `<Router>` wrapper

4. **Navigation Updates:**
   - Replace `navigate("/path")` with `useNavigate()`
   - Replace `<Link to="/path">` with TanStack `<Link to="/path">`

### Phase 3: Replace Gatsby-Specific Features

**Navigation:**
- Find all `import { navigate } from "gatsby"` (20 files)
- Replace with `import { useNavigate } from '@tanstack/react-router'`
- Convert: `navigate("/path")` → `const navigate = useNavigate(); navigate({ to: "/path" })`

**Location/Params:**
- Replace `useLocation()` from @reach/router with TanStack Router hooks
- Use `useParams()` for route parameters
- Use `useSearch()` for query parameters

**Head Management:**
- Remove `export function Head()` from all pages
- Add meta tags directly in route files using TanStack Router's head API
- Create custom `<PageHead>` component for common meta tags

**Environment Variables:**
- Find all `process.env.GATSBY_*` references
- Replace with `import.meta.env.VITE_*`
- Update `.env` file prefixes

### Phase 4: Static Assets & Fonts

**Move to Public Directory:**
- Move `src/images/icon.png` → `public/icon.png`
- Update all image references to use `/icon.png` paths

**Google Fonts:**
- Add `<link>` tag in `index.html`:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;400i;700&display=swap" rel="stylesheet">
  ```

**Favicon & Manifest:**
- Move manifest to `public/manifest.json`
- Add `<link rel="icon">` in `index.html`

### Phase 5: Build Configuration Updates

**package.json scripts:**
```json
{
  "scripts": {
    "dev": "vite",
    "dev:remote": "vite --host 0.0.0.0 --port 8000",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint \"**/*.{ts,tsx}\"",
    "format": "prettier --write \"**/*.{js,jsx,json,md}\""
  }
}
```

**TypeScript Configuration:**
```json
{
  "compilerOptions": {
    "types": ["vite/client"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler"
  }
}
```

**Environment Variables Type Definitions:**
Create `apps/web/src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SOCKET_URL: string
  // Add other env vars here
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

### Phase 6: Netlify Configuration

**Update `netlify.toml`:**
```toml
[build]
  base = "apps/web"
  command = "cd ../.. && npm ci && npm run build --workspace=web"
  publish = "dist"  # Changed from "public"

[build.environment]
  NODE_VERSION = "18"
  NPM_VERSION = "10.9.2"
  NODE_ENV = "production"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200  # SPA redirect for client-side routing
```

### Phase 7: Remove Gatsby Files & Dependencies

**Files to Delete:**
- `gatsby-config.js`
- `gatsby-node.js`
- `gatsby-browser.js`
- `gatsby-ssr.js`
- `src/@chakra-ui/gatsby-plugin/` (move theme to normal location)
- `.cache/` directory
- `public/` directory (will be regenerated by Vite)

**Dependencies to Remove:**
```bash
npm uninstall gatsby gatsby-plugin-netlify gatsby-source-filesystem \
  gatsby-transformer-sharp gatsby-plugin-sharp gatsby-plugin-image \
  gatsby-plugin-manifest gatsby-plugin-google-fonts gatsby-plugin-offline \
  @reach/router @types/reach__router
```

**Dependencies to Add:**
```bash
npm install vite @vitejs/plugin-react @tanstack/react-router \
  @tanstack/router-plugin

npm install -D @tanstack/router-devtools
```

## Migration Checklist

### Setup Phase
- [ ] Create `vite.config.ts`
- [ ] Create `index.html` entry point
- [ ] Create `src/main.tsx` React entry
- [ ] Install Vite & TanStack Router dependencies
- [ ] Create `src/routes/__root.tsx` root layout

### Route Migration
- [ ] Convert `src/pages/` → `src/routes/`
- [ ] Convert `index.tsx`
- [ ] Convert `about.tsx`
- [ ] Convert `callback.tsx`
- [ ] Convert `login.tsx`
- [ ] Convert `logout.tsx`
- [ ] Convert `privacy.tsx`
- [ ] Convert `rooms/[...].tsx` → `rooms/$roomId.tsx`
- [ ] Convert `rooms/create.tsx`
- [ ] Convert `404.tsx`

### Code Updates
- [ ] Replace `navigate` from gatsby (20 files to update)
- [ ] Replace `useLocation` from @reach/router
- [ ] Replace `process.env.GATSBY_*` with `import.meta.env.VITE_*`
- [ ] Remove GraphQL queries
- [ ] Remove `Head` exports
- [ ] Update RoomRoute component (remove @reach/router)

### Assets & Config
- [ ] Move images to `public/`
- [ ] Add Google Fonts to `index.html`
- [ ] Create `vite-env.d.ts` for env types
- [ ] Update `package.json` scripts
- [ ] Update `tsconfig.json`
- [ ] Update `netlify.toml`

### Cleanup
- [ ] Delete Gatsby config files
- [ ] Delete `.cache/` directory
- [ ] Uninstall Gatsby dependencies
- [ ] Remove `@chakra-ui/gatsby-plugin/` directory
- [ ] Update `.gitignore` (add `dist/`, remove `.cache/` and `public/`)

### Testing
- [ ] Test dev server: `npm run dev`
- [ ] Test all routes load correctly
- [ ] Test navigation between pages
- [ ] Test room creation flow
- [ ] Test OAuth callback flow
- [ ] Test build: `npm run build`
- [ ] Test preview: `npm run preview`
- [ ] Deploy to Netlify staging
- [ ] Verify production build

## Breaking Changes & Gotchas

1. **Environment Variables**: All `GATSBY_*` must be renamed to `VITE_*`
2. **Static Assets**: Images now served from `public/`, not optimized
3. **Navigation**: Different API - `navigate({ to: "/path" })` instead of `navigate("/path")`
4. **Build Output**: Changes from `public/` to `dist/`
5. **Dev Server**: No automatic restart on config changes (must manually restart)
6. **No GraphQL**: Site metadata must be hardcoded or fetched at runtime

## Rollback Plan

If migration fails:
1. Keep `gatsby-*` branch with working code
2. Revert `netlify.toml` changes
3. Restore Gatsby dependencies from `package.json` backup
4. Run `npm install` and `gatsby clean`

## Benefits After Migration

1. **Faster Builds**: Vite is significantly faster than Gatsby
2. **Simpler Config**: No complex Gatsby plugins
3. **Better DX**: Instant HMR, better error messages
4. **Modern Tooling**: ESM-native, better tree-shaking
5. **Reduced Bundle Size**: No Gatsby runtime overhead
6. **Easier Debugging**: Simpler build pipeline
7. **Better Netlify Reliability**: Standard SPA build, no @parcel/watcher issues

## Timeline Estimate

- **Phase 1-2**: 2-3 hours (Setup + Route conversion)
- **Phase 3-4**: 2-3 hours (Code updates + Assets)
- **Phase 5-6**: 1 hour (Build config + Netlify)
- **Phase 7**: 30 minutes (Cleanup)
- **Testing**: 1-2 hours

**Total**: ~7-10 hours

