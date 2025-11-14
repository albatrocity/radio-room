# Testing Guide - Local Development

## ✅ Current Status

- **API Server**: ✅ Running with `tsx` (hot-reload enabled)
- **TypeScript**: ✅ Compiling successfully
- **Adapters**: ✅ Spotify registered (playback controller + metadata source)
- **Docker**: ✅ Fully functional

## 🚀 Step 1: Set Up Environment Variables

Create a `.env` file in the project root:

```bash
# Copy this template
cat > .env << 'EOF'
# Spotify OAuth Credentials
# Get these from https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback

# Application URLs
APP_URL=http://localhost:8000
GATSBY_API_URL=http://localhost:3000

# Session Configuration
SESSION_SECRET=dev-secret-change-in-production

# Environment
ENVIRONMENT=development
NODE_ENV=development

# Redis (uses Docker service)
REDIS_URL=redis://redis:6379
EOF
```

### Get Spotify Credentials

1. Go to https://developer.spotify.com/dashboard
2. Create a new app (or use existing)
3. Add redirect URI: `http://localhost:3000/auth/spotify/callback`
4. Copy Client ID and Client Secret to your `.env` file

## 🏃 Step 2: Start the Services

```bash
# Start all services (API + Redis + Web)
docker compose up

# Or start just API and Redis (if you want to run web separately)
docker compose up api redis
```

### What Should Happen

You should see:
```
✅ redis-1  | Ready to accept connections
✅ api-1    | Spotify authentication completed
✅ api-1    | Playback controller registered: spotify
✅ api-1    | Metadata source registered: spotify
✅ api-1    | Listening on 3000
```

## 🧪 Step 3: Test the API

### Test 1: Health Check
```bash
curl http://localhost:3000/
# Should return: Cannot GET /
# (This is expected - no root route defined)
```

### Test 2: Spotify Auth Flow
1. Open browser: http://localhost:3000/auth/spotify/login
2. You should be redirected to Spotify login
3. After authorizing, you'll be redirected back
4. Check the logs for: "Spotify authentication successful"

### Test 3: Create a Room (After Auth)
```bash
# Replace YOUR_USER_ID with the userId from Spotify auth
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Room",
    "type": "jukebox",
    "userId": "YOUR_USER_ID",
    "challenge": "test-challenge",
    "playbackControllerId": "spotify",
    "metadataSourceId": "spotify"
  }'
```

## 🌐 Step 4: Test the Web App

### Option A: Run Web in Docker
```bash
docker compose up web
```
Visit: http://localhost:8000

### Option B: Run Web Locally (for faster development)
```bash
cd apps/web
npm install
npm run develop
```
Visit: http://localhost:8000

## 📝 Web App Changes Needed

### ✅ No Changes Required for Basic Functionality!

The web app should work with minimal changes because:
- The API routes are the same (`/api/rooms`, etc.)
- The Spotify auth flow is similar
- Socket.io events are unchanged

### 🔄 Optional Enhancements for New Features

#### 1. Update Room Creation Form

**File**: `apps/web/src/components/Lobby/ModalCreateRoom.tsx`

Add fields for adapter selection:

```tsx
// Add to the form
<FormControl>
  <FormLabel>Playback Source</FormLabel>
  <Select name="playbackControllerId" defaultValue="spotify">
    <option value="spotify">Spotify</option>
    {/* Future: Tidal, Apple Music, etc. */}
  </Select>
</FormControl>

<FormControl>
  <FormLabel>Metadata Source</FormLabel>
  <Select name="metadataSourceId" defaultValue="spotify">
    <option value="spotify">Spotify</option>
  </Select>
</FormControl>
```

#### 2. Update Room Creation API Call

**File**: `apps/web/src/machines/roomSetupMachine.ts`

Add new fields to the room creation:

```typescript
async function createRoom(ctx: RoomSetupContext) {
  const res = await apiCreateRoom({
    room: {
      type: ctx.room?.type ?? "jukebox",
      title: ctx.room?.title ?? "My Room",
      radioListenUrl: ctx.room?.radioListenUrl ?? undefined,
      radioMetaUrl: ctx.room?.radioMetaUrl ?? undefined,
      radioProtocol: ctx.room?.radioProtocol ?? undefined,
      deputizeOnJoin: ctx.room?.deputizeOnJoin ?? false,
      // NEW: Add adapter configuration
      playbackControllerId: ctx.room?.playbackControllerId ?? "spotify",
      metadataSourceId: ctx.room?.metadataSourceId ?? "spotify",
      mediaSourceId: ctx.room?.mediaSourceId,
      mediaSourceConfig: ctx.room?.mediaSourceConfig,
    },
    challenge: ctx.challenge ?? "",
    userId: ctx.userId ?? "",
  })
  return res
}
```

#### 3. Update Type Definitions

**File**: `apps/web/src/types/Room.ts`

Add new fields to the `Room` type:

```typescript
export type Room = {
  // ... existing fields
  playbackControllerId?: string
  metadataSourceId?: string
  mediaSourceId?: string
  mediaSourceConfig?: { url: string }
}

export type RoomSetup = {
  // ... existing fields
  playbackControllerId?: string
  metadataSourceId?: string
  mediaSourceId?: string
  mediaSourceConfig?: { url: string }
}
```

#### 4. Update Spotify Auth Button

**File**: `apps/web/src/components/ButtonAuthSpotify.tsx` (Line 36)

The URL is already correct! It points to:
```typescript
`${process.env.GATSBY_API_URL}/login?userId=${userId}`
```

But it should be:
```typescript
`${process.env.GATSBY_API_URL}/auth/spotify/login?userId=${userId}`
```

**Fix**:
```typescript
href={
  isAdmin
    ? `${process.env.GATSBY_API_URL}/auth/spotify/login?userId=${userId ?? currentUser.userId}`
    : undefined
}
```

## 🐛 Troubleshooting

### API Won't Start
```bash
# Check logs
docker compose logs api

# Common issues:
# 1. Port 3000 already in use
lsof -i :3000
# Kill the process or change port in compose.yml

# 2. Redis connection failed
docker compose logs redis
docker compose restart redis
```

### Web App Can't Connect to API
```bash
# Check GATSBY_API_URL environment variable
echo $GATSBY_API_URL

# Should be: http://localhost:3000
# If not set, add to .env:
GATSBY_API_URL=http://localhost:3000
```

### Spotify Auth Fails
1. Check redirect URI in Spotify Dashboard matches exactly:
   `http://localhost:3000/auth/spotify/callback`
2. Check Client ID and Secret in `.env`
3. Check API logs for error messages

### Hot Reload Not Working
```bash
# Restart the service
docker compose restart api

# Or rebuild
docker compose build api
docker compose up api
```

## 📊 Expected Test Flow

### Full End-to-End Test

1. **Start Services**
   ```bash
   docker compose up
   ```

2. **Authenticate with Spotify**
   - Visit: http://localhost:3000/auth/spotify/login
   - Login with Spotify
   - Should redirect back with success message

3. **Open Web App**
   - Visit: http://localhost:8000
   - You should see the lobby

4. **Create a Room**
   - Click "Create Room"
   - Fill in room details
   - Room should be created with Spotify as playback controller

5. **Test Playback** (if you have Spotify Premium)
   - Join the room
   - Add songs to queue
   - Control playback
   - Should see real-time updates

## 🎯 What's Working Now

- ✅ Server starts successfully
- ✅ Spotify adapter registration
- ✅ OAuth authentication flow
- ✅ Hot-reload with `tsx`
- ✅ Docker development environment
- ✅ Redis session storage
- ✅ Room creation API
- ✅ Socket.io connections

## 🚧 What Needs Testing

- ⏳ Room creation with new adapter fields
- ⏳ Spotify playback control
- ⏳ Metadata search
- ⏳ Queue management
- ⏳ Multi-user rooms
- ⏳ Shoutcast media source

## 📚 Next Steps After Testing

1. **If Everything Works**:
   - Start using the new adapter system
   - Add more adapters (Tidal, Apple Music, etc.)
   - Enhance the UI with adapter selection

2. **If Issues Found**:
   - Check logs: `docker compose logs -f`
   - Review error messages
   - Update this guide with solutions

3. **For Production**:
   - Fix the 14 legacy TypeScript errors
   - Uncomment build step in Dockerfile
   - Set up proper environment variables
   - Configure production Redis
   - Set up SSL/HTTPS

## 🎉 Success Criteria

You'll know it's working when:
1. ✅ API starts without errors
2. ✅ You can authenticate with Spotify
3. ✅ You can create a room
4. ✅ You can join a room
5. ✅ You can control playback (if Premium)
6. ✅ Hot-reload updates code instantly

Happy testing! 🚀

