# Testing the Authentication Fix

## What Was Fixed

The issue was that after completing Spotify OAuth:
- ✅ The API correctly set a session cookie
- ✅ The API redirected back to the web app with `?userId=...`
- ❌ The web app didn't recheck the session, so it appeared logged out

**Solution**: Created a `useOAuthCallback` hook that detects the OAuth redirect and triggers the auth machine to call `/me` and establish the session in the UI.

## Files Changed

1. **`apps/web/src/hooks/useOAuthCallback.ts`** (new)
   - Detects `?userId=...` parameter in URL
   - Triggers auth machine to call `/me` endpoint
   - Cleans up URL after processing

2. **`apps/web/src/pages/index.tsx`**
   - Added `useOAuthCallback()` hook to homepage

## How to Test

### Step 1: Clear Your Browser State
1. Open DevTools (F12)
2. Go to Application tab → Storage
3. Clear all cookies for `localhost:3000` and `localhost:8000`
4. Clear sessionStorage and localStorage
5. Refresh the page

### Step 2: Test the Login Flow
1. Go to `http://localhost:8000`
2. You should see a "Login" button (or similar)
3. Click the "Login" button
4. You'll be redirected to Spotify's authorization page
5. Click "Agree" on Spotify
6. You'll be redirected back to `http://localhost:8000`

### Step 3: Verify Success
After the redirect, you should see:
- ✅ The "Login" button disappears
- ✅ User info or profile appears
- ✅ Console shows: `"OAuth callback detected, rechecking session for user: YOUR_SPOTIFY_ID"`
- ✅ The URL cleans up (removes `?userId=...&toast=...` parameters after 1 second)

### Step 4: Verify Session Persistence
1. Refresh the page (`Cmd+R` or `F5`)
2. You should **still be logged in** (no need to re-authenticate)
3. This confirms the session cookie is working

### Step 5: Test in Browser Console (Optional)
After OAuth redirect, open DevTools console and run:

```javascript
fetch('http://localhost:3000/me', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

You should see:
```json
{
  "user": {
    "userId": "your_spotify_id",
    "username": "Your Name",
    "isAdmin": true
  },
  "isNewUser": false
}
```

## Troubleshooting

### Still Seeing "Login" Button After OAuth

**Check 1: Session Cookie**
1. Open DevTools → Application → Cookies
2. Look for a cookie named `connect.sid` on `localhost:3000`
3. If it's missing, the session isn't being set

**Check 2: CORS**
1. Open DevTools → Network tab
2. Look for the `/me` request
3. Check if it has `credentials: include` in the request headers
4. Check if the response has `Access-Control-Allow-Credentials: true`

**Check 3: Console Logs**
Look for these messages:
- `"OAuth callback detected, rechecking session for user: ..."`
- API logs should show a `GET /me` request

### Session Cookie Not Being Set

If the session cookie isn't being set, check:

1. **Environment Variables**
   ```bash
   docker compose exec api printenv | grep SESSION_SECRET
   ```
   Should show a value (not empty)

2. **Redis Connection**
   ```bash
   docker compose exec api printenv | grep REDIS_URL
   ```
   Should be `redis://redis:6379`

3. **API Logs**
   ```bash
   docker compose logs api --tail 50 | grep -i "session\|cookie"
   ```

### Auth Machine Not Calling `/me`

If the hook isn't triggering, check:
1. Console for the log message: `"OAuth callback detected..."`
2. Network tab for a `GET /me` request
3. Make sure you're landing on the homepage (`/`) after OAuth

## What Happens Next

After successful authentication:
1. You can create rooms
2. You can link your Spotify account to rooms
3. Your session persists across page refreshes
4. You can log out by clearing cookies or using a logout button (if implemented)

## Production Considerations

For production deployment, ensure:
1. `SESSION_SECRET` is a strong, random value (not "dev-secret-change-in-production")
2. `APP_URL` points to your production web app URL
3. `SPOTIFY_REDIRECT_URI` points to your production API callback URL
4. CORS origins include your production domains
5. Session cookies use `secure: true` (already configured for production)

## Next Steps

Once authentication works:
1. Test creating a room
2. Test linking Spotify to a room
3. Test playback controls
4. Test metadata search
5. Test Shoutcast media source

See `TESTING_GUIDE.md` for comprehensive testing instructions.

