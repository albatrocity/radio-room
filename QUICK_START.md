# Quick Start Guide

Get your Radio Room development environment running in 3 steps!

## Prerequisites

- Docker Desktop installed and running
- Spotify Developer Account (for OAuth credentials)

## Step 1: Get Spotify Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add redirect URI: `http://localhost:3000/auth/spotify/callback`
4. Copy your Client ID and Client Secret

## Step 2: Create Environment File

Create a `.env` file in the project root:

```bash
# In /Users/rossbrown/Dev/radio-room/.env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback
APP_URL=http://localhost:8000
SESSION_SECRET=dev-secret-change-in-production
ENVIRONMENT=development
```

## Step 3: Start Docker

```bash
docker compose up
```

That's it! 🎉

## What's Running

- **API Server**: http://localhost:3000
- **Web App**: http://localhost:8000
- **Redis**: localhost:6379

## Test the Adapter System

### 1. Authenticate with Spotify

Visit: http://localhost:3000/auth/spotify/login

### 2. Check the Logs

You should see:
```
api_1    | Playback controller registered: spotify
api_1    | Metadata source registered: spotify
api_1    | Server started successfully
api_1    | Listening on 3000
```

### 3. Create a Room

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Room",
    "type": "jukebox",
    "userId": "your-spotify-user-id",
    "playbackControllerId": "spotify",
    "metadataSourceId": "spotify"
  }'
```

## Development Workflow

### Making Code Changes

1. Edit files in `apps/api/src/` or `packages/`
2. Save the file
3. Watch the terminal - the server auto-restarts!

### Viewing Logs

```bash
# All services
docker compose logs -f

# Just the API
docker compose logs -f api
```

### Stopping

```bash
# Stop services
docker compose down

# Stop and remove data
docker compose down -v
```

### Rebuilding

```bash
# Rebuild after package.json changes
docker compose build

# Rebuild and start
docker compose up --build
```

## Troubleshooting

### Port Already in Use

If you get "port already in use" errors:

```bash
# Check what's using the port
lsof -i :3000
lsof -i :8000

# Kill the process or change ports in compose.yml
```

### Redis Connection Issues

```bash
# Restart just Redis
docker compose restart redis

# Check Redis is running
docker compose ps
```

### File Permission Issues

If you see permission errors:

```bash
# Fix ownership (on Mac/Linux)
sudo chown -R $USER:$USER .
```

## Next Steps

- Read `PLAN.md` to understand the architecture
- Check `DOCKER_BUILD_SUCCESS.md` for technical details
- Explore the adapter implementations in `packages/adapter-spotify/`
- Review the type definitions in `packages/types/`

## Need Help?

Check these files:
- `DOCKER_BUILD_STATUS.md` - Current build status
- `DOCKER_FIXES.md` - Technical fixes applied
- `PLAN.md` - Architecture overview

