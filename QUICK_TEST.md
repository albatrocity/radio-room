# Quick Test - Get Running in 5 Minutes

## 1. Create `.env` File (2 minutes)

```bash
cd /Users/rossbrown/Dev/radio-room

cat > .env << 'EOF'
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback
APP_URL=http://localhost:8000
GATSBY_API_URL=http://localhost:3000
SESSION_SECRET=dev-secret
ENVIRONMENT=development
NODE_ENV=development
REDIS_URL=redis://redis:6379
EOF
```

Get Spotify credentials: https://developer.spotify.com/dashboard

## 2. Start Services (1 minute)

```bash
docker compose up
```

Wait for:
```
✅ api-1 | Listening on 3000
```

## 3. Test API (1 minute)

Open browser: http://localhost:3000/auth/spotify/login

You should:
1. Be redirected to Spotify
2. Login/authorize
3. Be redirected back
4. See success message

## 4. Test Web App (1 minute)

Open browser: http://localhost:8000

You should see the Listening Room lobby!

## 🐛 If Something Fails

### API won't start
```bash
docker compose logs api
```

### Port already in use
```bash
lsof -i :3000
# Kill the process or change port in compose.yml
```

### Spotify auth fails
- Check redirect URI in Spotify Dashboard: `http://localhost:3000/auth/spotify/callback`
- Check Client ID/Secret in `.env`

## ✅ You're Done!

The server is running with:
- ✅ TypeScript compilation (tsx)
- ✅ Hot-reload enabled
- ✅ Spotify adapter registered
- ✅ Docker environment ready

## 📚 Next Steps

- Read `TESTING_GUIDE.md` for detailed testing
- Read `WEB_APP_CHANGES.md` for frontend updates
- Read `IMPLEMENTATION_COMPLETE.md` for architecture overview

## 🎯 One Critical Web App Fix

**File**: `apps/web/src/components/ButtonAuthSpotify.tsx` line 36

Change:
```typescript
`${process.env.GATSBY_API_URL}/login?userId=...`
```

To:
```typescript
`${process.env.GATSBY_API_URL}/auth/spotify/login?userId=...`
```

That's the only required change! Everything else works as-is.

