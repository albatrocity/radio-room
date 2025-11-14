# Authentication Flow Issue & Fix

## The Problem

After Spotify OAuth completes:
1. ✅ API sets session cookie
2. ✅ API redirects to web app with `?toast=...&userId=...`
3. ❌ Web app doesn't check session, so user appears logged out

## Root Cause

The web app's auth machine (`authMachine.ts`) initializes by calling `/me` to check for an existing session. However, when you land on the homepage after OAuth redirect, the auth machine might have already initialized before the redirect happened, so it doesn't re-check.

## Solution Options

### Option 1: Force Auth Recheck on OAuth Redirect (Recommended)

Update the homepage or callback page to trigger an auth recheck when it sees the `userId` query parameter.

**File**: `apps/web/src/pages/index.tsx` or create a new component

```typescript
import { useEffect } from "react"
import { useLocation } from "@reach/router"
import { useAuthStore } from "../state/authStore"

export function useOAuthCallback() {
  const location = useLocation()
  const { send } = useAuthStore()
  
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const userId = params.get("userId")
    const toast = params.get("toast")
    
    if (userId) {
      // User just completed OAuth, recheck session
      send("GET_SESSION_USER")
      
      // Clean up URL
      window.history.replaceState({}, document.title, location.pathname)
    }
  }, [location.search])
}
```

### Option 2: Make Auth Machine Listen for URL Changes

Update `authMachine.ts` to automatically recheck session when URL contains `userId` parameter.

### Option 3: Simpler - Just Reload the Page

The easiest fix is to have the API redirect to a URL that forces a page reload:

**File**: `packages/adapter-spotify/lib/authRoutes.ts:133`

Change:
```typescript
res.redirect(`${process.env.APP_URL}${redirect ?? ""}?${querystring.stringify(params)}`)
```

To:
```typescript
// Force a full page reload to reinitialize auth
res.redirect(`${process.env.APP_URL}/?refresh=true&${querystring.stringify(params)}`)
```

Then in the web app, detect `refresh=true` and reload once.

## Recommended Implementation

I recommend **Option 1** as it's the cleanest. Here's the full implementation:

### Step 1: Create Auth Callback Hook

**File**: `apps/web/src/hooks/useOAuthCallback.ts` (new file)

```typescript
import { useEffect } from "react"
import { useLocation } from "@reach/router"
import { useAuthStore } from "../state/authStore"
import { toast as showToast } from "../lib/toasts"

export function useOAuthCallback() {
  const location = useLocation()
  const { send } = useAuthStore()
  
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const userId = params.get("userId")
    const toastMessage = params.get("toast")
    
    if (userId) {
      console.log("OAuth callback detected, rechecking session...")
      
      // Force auth machine to recheck session
      send("GET_SESSION_USER")
      
      // Show success toast if provided
      if (toastMessage) {
        showToast({
          title: toastMessage,
          status: "success",
          duration: 5000,
        })
      }
      
      // Clean up URL parameters
      const cleanUrl = `${location.pathname}${location.hash}`
      window.history.replaceState({}, document.title, cleanUrl)
    }
  }, [location.search, send])
}
```

### Step 2: Use Hook in Main Layout

**File**: `apps/web/src/components/PageLayout.tsx`

Add to the component:

```typescript
import { useOAuthCallback } from "../hooks/useOAuthCallback"

export default function PageLayout({ children }: Props) {
  useOAuthCallback() // Add this line
  
  // ... rest of component
}
```

Or in the index page:

**File**: `apps/web/src/pages/index.tsx`

```typescript
import { useOAuthCallback } from "../hooks/useOAuthCallback"

export default function IndexPage() {
  useOAuthCallback() // Add this line
  
  // ... rest of component
}
```

## Testing

After implementing:

1. Click "Login"
2. Authorize with Spotify
3. You should be redirected back
4. The auth machine will call `/me`
5. Session will be established
6. "Login" button should change to user info

## Why This Works

1. OAuth completes, API sets session cookie
2. API redirects to web app with `?userId=...`
3. Web app detects `userId` parameter
4. Web app calls `send("GET_SESSION_USER")`
5. Auth machine calls `/me` endpoint
6. `/me` returns user info from session
7. Auth machine transitions to "authenticated" state
8. UI updates to show user is logged in

## Alternative: Quick Test

To quickly test if sessions work, try this in browser console after OAuth redirect:

```javascript
fetch('http://localhost:3000/me', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log)
```

If this returns user data, the session is working and you just need to trigger the auth recheck in the UI.

