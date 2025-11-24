# Docker Setup Guide

## Prerequisites

- Docker Desktop installed and running
- Docker Compose v2+
- Spotify Developer Account (for OAuth credentials)

## Initial Setup

### 1. Get Spotify Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications)
2. Create a new application
3. Add `http://localhost:3000/auth/spotify/callback` to Redirect URIs
4. Copy your Client ID and Client Secret

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Spotify credentials:

```env
SPOTIFY_CLIENT_ID=your_actual_client_id
SPOTIFY_CLIENT_SECRET=your_actual_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback
APP_URL=http://localhost:8000
```

### 3. Start Services

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build
```

This will start:
- **Redis** on port 6379
- **API** on port 3000
- **Web** on port 8000 (Gatsby dev server)

## Development Workflow

### Hot Reloading

Both services support hot reloading:
- **API**: Changes to `apps/api/src/**` and `packages/**` will auto-reload
- **Web**: Changes to `apps/web/src/**` will trigger Gatsby hot reload

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f web
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart api
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clears Redis data)
docker-compose down -v
```

## Testing the Setup

### 1. Check API Health

```bash
curl http://localhost:3000/me
```

Should return: `{"error":"Unauthorized"}` (expected - not logged in)

### 2. Test Spotify Auth

1. Navigate to: http://localhost:3000/auth/spotify/login
2. Log in with your Spotify account
3. You should be redirected back to the web app

### 3. Check Redis Connection

```bash
docker-compose exec redis redis-cli ping
```

Should return: `PONG`

## Troubleshooting

### API Won't Start

```bash
# Check logs
docker-compose logs api

# Common issues:
# - Missing environment variables
# - Redis not running
# - Port 3000 already in use
```

### Web Won't Start

```bash
# Check logs
docker-compose logs web

# Common issues:
# - Port 8000 already in use
# - Node modules issues (try rebuilding)
```

### Rebuild from Scratch

```bash
# Stop everything
docker-compose down -v

# Remove all images
docker-compose rm -f

# Rebuild
docker-compose up --build
```

### Node Modules Issues

If you have node_modules conflicts between host and container:

```bash
# Clean local node_modules
rm -rf node_modules apps/*/node_modules packages/*/node_modules

# Rebuild containers
docker-compose up --build
```

## Production Build

To build for production:

```bash
# Build API
docker build -f apps/api/Dockerfile -t radio-room-api .

# Run production API
docker run -p 3000:3000 \
  -e REDIS_URL=redis://your-redis:6379 \
  -e SPOTIFY_CLIENT_ID=your_id \
  -e SPOTIFY_CLIENT_SECRET=your_secret \
  radio-room-api

# Build Web
docker build -f apps/web/Dockerfile --target runner -t radio-room-web .

# Run production Web
docker run -p 8000:8000 radio-room-web
```

## Architecture

```
┌─────────────────────────────────────────────┐
│  Web (Gatsby)                               │
│  Port 8000, 9000                            │
│  → Frontend application                     │
└─────────────┬───────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────┐
│  API (Express + Socket.IO)                  │
│  Port 3000                                  │
│  → REST endpoints                           │
│  → WebSocket connections                    │
│  → Adapter system (Spotify, Shoutcast)     │
└─────────────┬───────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────┐
│  Redis                                      │
│  Port 6379                                  │
│  → Session storage                          │
│  → Pub/Sub for realtime events             │
│  → Room/user data                           │
└─────────────────────────────────────────────┘
```

## Volume Mounts

Development volumes mounted for hot reloading:

**API:**
- `./apps/api/src` → `/app/apps/api/src`
- `./packages` → `/app/packages`

**Web:**
- `./apps/web/src` → `/app/apps/web/src`
- `./apps/web/public` → `/app/apps/web/public`
- Config files (gatsby-*.js)

## Next Steps

After services are running:

1. Authenticate with Spotify: `http://localhost:3000/auth/spotify/login`
2. Access web app: `http://localhost:8000`
3. Create a room with adapter configuration
4. Test playback and metadata features

