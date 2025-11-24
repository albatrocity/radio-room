# Gatsby to Vite Migration Progress

## Status: Phase 3 In Progress (50% Complete)

### ✅ Completed Phases

#### Phase 1: Setup Vite Infrastructure (COMPLETE)
- ✅ Created `vite.config.ts`
- ✅ Created `index.html` entry point  
- ✅ Created `src/main.tsx` React entry
- ✅ Created `src/routes/__root.tsx` root layout
- ✅ Moved theme from `@chakra-ui/gatsby-plugin/` to `src/theme/`
- ✅ Created `src/vite-env.d.ts` for env types
- ✅ Installed Vite & TanStack Router dependencies:
  - vite
  - @vitejs/plugin-react
  - @tanstack/react-router
  - @tanstack/router-plugin
  - @tanstack/router-devtools

#### Phase 2: Convert Pages to TanStack Router Routes (COMPLETE)
All pages converted from `src/pages/` to `src/routes/`:
- ✅ `index.tsx` - Lobby page
- ✅ `about.tsx` - About page
- ✅ `callback.tsx` - OAuth callback
- ✅ `login.tsx` - Login redirect
- ✅ `logout.tsx` - Logout page
- ✅ `privacy.tsx` - Privacy policy
- ✅ `$.tsx` - 404 catch-all
- ✅ `rooms/$roomId.tsx` - Dynamic room route
- ✅ `rooms/create.tsx` - Room creation

All routes:
- Removed GraphQL queries
- Removed `Head` exports
- Converted to TanStack Router file-based routing
- Changed env vars from `process.env.GATSBY_*` to `import.meta.env.VITE_*`

### 🔄 Phase 3: Replace Gatsby-Specific Features (IN PROGRESS)

#### Files Updated So Far:
1. ✅ `components/SpotifyAuthorization.tsx`
   - Replaced `useLocation` from @reach/router with `useSearch`
   - Replaced `navigate` from gatsby with `useNavigate` from TanStack Router

#### Remaining Files to Update (19 files):
These files still import from Gatsby and need updates:

**State Management:**
- `state/roomStore.ts` - Uses `navigate` from gatsby
- `machines/roomSetupMachine.ts` - Uses `navigate` from gatsby  
- `machines/adminMachine.ts` - Uses `navigate` from gatsby

**Components:**
- `components/Lobby/createRoomFormMachine.ts` - Uses `navigate` from gatsby
- `components/RoomSettings/RoomSettings.tsx` - May use Gatsby features
- `components/RoomHead.tsx` - Needs Head management update
- `components/RoomError.tsx` - May use navigate
- `components/PageLayout.tsx` - May use Gatsby features
- `components/CardRoom.tsx` - May use navigate/Link
- `components/AdminControls.tsx` - May use navigate

**Old Pages (can be deleted after Phase 7):**
- `pages/login.tsx`
- `pages/index.tsx`
- `pages/rooms/create.tsx`
- `pages/rooms/[...].tsx`
- `pages/privacy.tsx`
- `pages/logout.tsx`
- `pages/callback.tsx`
- `pages/about.tsx`
- `pages/404.tsx`

### 📋 Remaining Phases

#### Phase 4: Move Static Assets (PENDING)
- [ ] Move `src/images/icon.png` → `public/icon.png`
- [ ] Create `public/manifest.json` if needed
- [ ] Update image references

#### Phase 5: Update Build Configuration (PENDING)
- [ ] Update `package.json` scripts
- [ ] Update `tsconfig.json` for Vite
- [ ] Update `.gitignore` (add `dist/`, remove `.cache/` and `public/`)

#### Phase 6: Update Netlify Configuration (PENDING)
- [ ] Update `netlify.toml`:
  - Change publish from "public" to "dist"
  - Add SPA redirect rule
  - Update build command

#### Phase 7: Remove Gatsby (PENDING)
- [ ] Delete Gatsby config files
- [ ] Delete `.cache/` directory
- [ ] Delete `src/pages/` directory
- [ ] Delete `src/@chakra-ui/gatsby-plugin/` directory
- [ ] Uninstall Gatsby dependencies
- [ ] Remove old `public/` directory

### 🧪 Phase 8: Testing (PENDING)
- [ ] Test dev server: `npm run dev`
- [ ] Test all routes load correctly
- [ ] Test navigation between pages
- [ ] Test room creation flow
- [ ] Test OAuth callback flow
- [ ] Test build: `npm run build`
- [ ] Test preview: `npm run preview`
- [ ] Deploy to Netlify staging
- [ ] Verify production build

## Next Steps

1. **Complete Phase 3**: Update remaining 19 files that import from Gatsby
   - Focus on state management files first (roomStore, machines)
   - Then update components
   
2. **Move to Phase 4**: Simple asset moves

3. **Phases 5-6**: Configuration updates

4. **Phase 7**: Clean up and remove Gatsby

5. **Phase 8**: Comprehensive testing

## Key Migration Patterns

### Navigation
```typescript
// OLD (Gatsby)
import { navigate } from "gatsby"
navigate("/path", { replace: true })

// NEW (TanStack Router)
import { useNavigate } from "@tanstack/react-router"
const navigate = useNavigate()
navigate({ to: "/path", replace: true })
```

### Location/Search Params
```typescript
// OLD (@reach/router)
import { useLocation } from "@reach/router"
const location = useLocation()
const urlParams = new URLSearchParams(location.search)

// NEW (TanStack Router)
import { useSearch } from "@tanstack/react-router"
const searchParams = useSearch({ strict: false })
const myParam = (searchParams as any).myParam
```

### Route Params
```typescript
// OLD (@reach/router)
const RoomRoute = ({ roomId }: { roomId?: string; path: string }) => {

// NEW (TanStack Router)
import { useParams } from "@tanstack/react-router"
const { roomId } = useParams({ from: '/rooms/$roomId' })
```

### Environment Variables
```typescript
// OLD
process.env.GATSBY_API_URL

// NEW
import.meta.env.VITE_API_URL
```

## Estimated Time Remaining

- Phase 3 completion: 2-3 hours
- Phases 4-6: 1 hour
- Phase 7: 30 minutes
- Phase 8: 1-2 hours

**Total Remaining**: ~5-7 hours

