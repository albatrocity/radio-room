# Authentication Fix - Final Solution

## The Real Problem

You were already handling OAuth callbacks in `SpotifyAuthorization.tsx`, but it was only looking for the `code` parameter (client-side PKCE flow). The new server-side OAuth flow redirects with `userId` and `toast` parameters instead, so the component wasn't handling it.

## The Solution

Updated `SpotifyAuthorization.tsx` to handle **both** OAuth flows:

1. **Server-side OAuth** (new): Looks for `?userId=...` parameter
   - Triggers auth machine to call `/me` endpoint
   - Establishes session in the UI
   - Redirects to the saved path

2. **Client-side PKCE OAuth** (legacy): Looks for `?code=...` parameter
   - Exchanges code for tokens (client-side)
   - Used for user-specific Spotify actions

## Files Changed

**`apps/web/src/components/SpotifyAuthorization.tsx`**
- Added `useAuthStore` to trigger session check
- Added detection for `userId` parameter (server-side OAuth)
- Kept existing `code` parameter handling (client-side PKCE)
- Calls `sendAuth("GET_SESSION_USER")` when `userId` is present

## How It Works

### Server-Side OAuth Flow (Room Creator Auth)
1. User clicks "Login" → `/login` page
2. Redirects to API `/auth/spotify/login`
3. API redirects to Spotify
4. Spotify redirects to API `/auth/spotify/callback`
5. API sets session cookie
6. API redirects to web app `/callback?userId=...&toast=...`
7. `SpotifyAuthorization` detects `userId` parameter
8. Calls `sendAuth("GET_SESSION_USER")` → triggers `/me` endpoint
9. Auth machine receives user data from session
10. UI updates to show user is logged in
11. Redirects to saved path (or homepage)

### Client-Side PKCE Flow (User-Specific Actions)
1. User clicks "Link Spotify" in a room
2. Client generates PKCE challenge
3. Redirects to Spotify with challenge
4. Spotify redirects to web app `/callback?code=...`
5. `SpotifyAuthorization` detects `code` parameter
6. Exchanges code for tokens (client-side)
7. Stores tokens in sessionStorage
8. Used for search, library actions, etc.

## Testing

### Step 1: Clear Browser State
1. Open DevTools (F12)
2. Application → Storage → Clear all
3. Refresh page

### Step 2: Test Login
1. Go to `http://localhost:8000`
2. Click "Login"
3. Authorize with Spotify
4. You'll be redirected to `/callback?userId=...&toast=...`

### Step 3: Check Console
You should see:
```
Server-side OAuth callback detected for user: YOUR_SPOTIFY_ID
```

### Step 4: Verify Success
- ✅ "Login" button disappears
- ✅ User info appears
- ✅ Redirected to homepage
- ✅ Session persists on refresh

### Step 5: Check Network Tab
Look for:
- `GET /me` request to `localhost:3000`
- Request has `credentials: include`
- Response returns user data

## Troubleshooting

### Still Not Working?

**Check 1: Console Logs**
```
Server-side OAuth callback detected for user: ...
```
If you don't see this, the `userId` parameter isn't being detected.

**Check 2: Network Tab**
Look for `GET /me` request. If it's missing, the auth machine isn't being triggered.

**Check 3: Session Cookie**
DevTools → Application → Cookies → `localhost:3000`
Should have a `connect.sid` cookie.

**Check 4: API Logs**
```bash
docker compose logs api --tail 50 | grep -i "callback\|session\|me"
```

### Session Not Persisting?

If you're logged in but lose session on refresh:
1. Check if `connect.sid` cookie exists
2. Check cookie expiration (should be 1 year)
3. Check Redis connection: `docker compose logs redis`

### Auth Machine Not Updating?

If `/me` is called but UI doesn't update:
1. Check `/me` response in Network tab
2. Should return `{ user: {...}, isNewUser: false }`
3. Check auth machine state in React DevTools

## What's Next?

Once authentication works:
1. ✅ User can log in via Spotify
2. ✅ Session persists across refreshes
3. ✅ User can create rooms
4. ⏳ Test room creation with Spotify adapter
5. ⏳ Test playback controls
6. ⏳ Test metadata search

## Key Differences from Previous Attempt

**Previous attempt**: Created a new hook (`useOAuthCallback`) on the index page
- ❌ Didn't account for existing `SpotifyAuthorization` component
- ❌ Duplicated OAuth handling logic

**Current solution**: Updated existing `SpotifyAuthorization` component
- ✅ Handles both OAuth flows in one place
- ✅ Maintains backward compatibility with PKCE flow
- ✅ Uses existing callback page (`/callback`)
- ✅ Cleaner architecture

## Files to Delete (Optional)

These files were created in the previous attempt and are no longer needed:
- `apps/web/src/hooks/useOAuthCallback.ts`
- `AUTHENTICATION_FLOW_FIX.md`
- `TESTING_AUTH_FIX.md`

The hook is not harmful, but it's redundant now that `SpotifyAuthorization` handles everything.

