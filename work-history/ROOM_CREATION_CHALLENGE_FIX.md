# Room Creation Authorization Challenge Fix

## Issue
After completing Spotify OAuth during room creation, users were redirected back to the app but received an "Invalid authorization challenge" error.

## Root Causes

### Problem 1: Missing Challenge in OAuth Callback
The Spotify OAuth callback wasn't generating or sending a `challenge` parameter.

**Location:** `packages/adapter-spotify/lib/authRoutes.ts` (line 133)

```typescript
// ❌ BEFORE: No challenge generated
const params = {
  toast: "Spotify authentication successful",
  userId,
}
res.redirect(`${process.env.APP_URL}${redirect ?? ""}?${querystring.stringify(params)}`)
```

### Problem 2: Challenge Not Preserved During Redirect
The `SpotifyAuthorization` component wasn't preserving `userId` and `challenge` params when redirecting to `/rooms/create`.

**Location:** `apps/web/src/components/SpotifyAuthorization.tsx` (line 29-34)

```typescript
// ❌ BEFORE: Params not preserved
const redirectPath = sessionStorage.getItem("postSpotifyAuthRedirect") ?? "/"
sessionStorage.removeItem("postSpotifyAuthRedirect")

setTimeout(() => {
  navigate(redirectPath, { replace: true }) // Lost userId and challenge!
}, 500)
```

## The Challenge System

The challenge is a security mechanism that ensures room creation requests come from authenticated users who just completed OAuth:

1. **Generated**: After successful OAuth (valid for 5 minutes)
2. **Stored**: In Redis as `challenge:${userId}`
3. **Validated**: When creating a room via `/rooms` POST endpoint
4. **Cleared**: After successful room creation

### Challenge Flow

```typescript
// Generation (authRoutes.ts)
const challenge = generateRandomString(32)
await storeUserChallenge({ userId, challenge }, context)

// Storage (userChallenge.ts)
await context.redis.pubClient.set(`challenge:${userId}`, challenge, {
  PX: FIVE_MINUTES, // Expires in 5 minutes
})

// Validation (roomsController.ts)
await checkUserChallenge({ challenge, userId, context })
// Throws "Unauthorized" if invalid or expired
```

## Solutions

### Fix 1: Generate Challenge in OAuth Callback

Updated `packages/adapter-spotify/lib/authRoutes.ts`:

```typescript
// ✅ AFTER: Generate and store challenge
import { storeUserChallenge } from "@repo/server/operations/userChallenge"

// ... in callback handler after successful auth:
const challenge = generateRandomString(32)
await storeUserChallenge({ userId, challenge }, context)

if (process.env.APP_URL) {
  const params = {
    toast: "Spotify authentication successful",
    userId,
    challenge, // ✅ Now included
  }
  res.redirect(`${process.env.APP_URL}${redirect ?? ""}?${querystring.stringify(params)}`)
} else {
  res.send({ access_token, userId, challenge })
}
```

**Changes:**
- Line 7: Added import for `storeUserChallenge`
- Line 127-128: Generate 32-character random challenge
- Line 131: Include `challenge` in redirect params
- Line 136: Include `challenge` in JSON response

### Fix 2: Preserve Challenge in SpotifyAuthorization

Updated `apps/web/src/components/SpotifyAuthorization.tsx`:

```typescript
// ✅ AFTER: Preserve userId and challenge params
const urlParams = new URLSearchParams(location.search)
const code = urlParams.get("code")
const userId = urlParams.get("userId")
const challenge = urlParams.get("challenge") // ✅ Extract challenge
const toastMessage = urlParams.get("toast")

useEffect(() => {
  if (userId) {
    console.log("Server-side OAuth callback detected for user:", userId)
    
    sendAuth("GET_SESSION_USER")
    
    const redirectPath = sessionStorage.getItem("postSpotifyAuthRedirect") ?? "/"
    sessionStorage.removeItem("postSpotifyAuthRedirect")
    
    // ✅ Preserve userId and challenge params
    const redirectUrl = new URL(redirectPath, window.location.origin)
    if (userId) redirectUrl.searchParams.set("userId", userId)
    if (challenge) redirectUrl.searchParams.set("challenge", challenge)
    
    setTimeout(() => {
      navigate(`${redirectUrl.pathname}${redirectUrl.search}`, { replace: true })
    }, 500)
  }
  // ... rest of handlers
}, [code, userId])
```

**Changes:**
- Line 18: Extract `challenge` from URL params
- Lines 32-34: Build new URL with query params preserved
- Line 37: Navigate with full path including search params

## Complete Flow After Fixes

### 1. User Initiates Room Creation
```
User fills form → stores settings in sessionStorage
  ↓
Clicks "Login & Create"
  ↓
sessionStorage.setItem("postSpotifyAuthRedirect", "/rooms/create")
  ↓
window.location.href = "/auth/spotify/login?redirect=/callback"
```

### 2. Spotify OAuth
```
User authenticates with Spotify
  ↓
Spotify redirects to /auth/spotify/callback?code=...&state=...
```

### 3. Server Callback Handler (authRoutes.ts)
```typescript
Exchange code for tokens
  ↓
Get user profile from Spotify API
  ↓
Store tokens in Redis
  ↓
Generate challenge = generateRandomString(32)
  ↓
Store challenge in Redis (expires in 5 min)
  ↓
Redirect to: /callback?userId=X&challenge=Y&toast=Success
```

### 4. Client Callback Handler (SpotifyAuthorization.tsx)
```typescript
Extract: userId, challenge from URL
  ↓
Get redirect path from sessionStorage: "/rooms/create"
  ↓
Build URL: /rooms/create?userId=X&challenge=Y
  ↓
Navigate to final URL ✅
```

### 5. Room Creation Page (create.tsx)
```typescript
Extract: challenge, userId from URL params
  ↓
if (!challenge || !userId) → redirect with error ❌
  ↓
Load room settings from sessionStorage
  ↓
Call API: POST /rooms with { challenge, userId, ...settings }
  ↓
Server validates challenge ✅
  ↓
Room created successfully 🎉
```

## Security Benefits

The challenge system prevents:

1. **Replay attacks**: Challenge expires after 5 minutes
2. **CSRF**: Challenge tied to specific userId
3. **Unauthorized room creation**: Must complete OAuth flow first
4. **Token theft**: Challenge is separate from OAuth tokens

## Testing

To verify the fix:

1. Navigate to lobby
2. Click "Create Room"
3. Fill in room details
4. Click "Login & Create"
5. Authenticate with Spotify
6. Should redirect to `/callback?userId=X&challenge=Y&toast=...`
7. Should automatically redirect to `/rooms/create?userId=X&challenge=Y`
8. Room should be created successfully ✅

## Related Files

### Modified:
- ✅ `packages/adapter-spotify/lib/authRoutes.ts` - Generate and send challenge
- ✅ `apps/web/src/components/SpotifyAuthorization.tsx` - Preserve challenge in redirect

### Referenced:
- `packages/server/operations/userChallenge.ts` - Challenge storage/validation
- `apps/web/src/pages/rooms/create.tsx` - Challenge validation at page level
- `packages/server/controllers/roomsController.ts` - Challenge validation at API level

## Summary

**Before:**
- OAuth callback didn't generate challenge → Missing param
- SpotifyAuthorization didn't preserve params → Lost during redirect
- Result: "Invalid authorization challenge" error ❌

**After:**
- OAuth callback generates and stores challenge ✅
- SpotifyAuthorization preserves userId and challenge ✅
- Result: Room creation works correctly 🎉

