# Environment Variables Template

Create a `.env` file in the project root with these variables:

```bash
# Spotify OAuth Credentials
# Get these from https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback

# Application URLs
APP_URL=http://localhost:8000
API_URL=http://localhost:3000

# Session Configuration
SESSION_SECRET=dev-secret-change-in-production

# Environment
ENVIRONMENT=development
NODE_ENV=development

# Redis (uses Docker service)
REDIS_URL=redis://redis:6379
```

## Quick Setup

```bash
# Copy this to create your .env file
cat > .env << 'EOF'
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback
APP_URL=http://localhost:8000
SESSION_SECRET=dev-secret-change-in-production
ENVIRONMENT=development
NODE_ENV=development
REDIS_URL=redis://redis:6379
EOF
```

Then edit `.env` and replace `your_client_id_here` and `your_client_secret_here` with your actual Spotify credentials.

## Environment Variables Explained

### Required for API

- **`SPOTIFY_CLIENT_ID`**: Your Spotify app's client ID
- **`SPOTIFY_CLIENT_SECRET`**: Your Spotify app's client secret
- **`SPOTIFY_REDIRECT_URI`**: OAuth callback URL (must match Spotify Dashboard)
- **`REDIS_URL`**: Redis connection string (uses Docker service by default)
- **`SESSION_SECRET`**: Secret for session encryption (change in production!)

### Required for Web App

### Required for API (Image Support)

- **`API_URL`**: Public URL of the API server (used for generating absolute image URLs in chat)
  - Default: `http://localhost:3000`

### Optional

- **`APP_URL`**: URL where the web app is running (for OAuth redirects)
- **`ENVIRONMENT`**: `development` or `production`
- **`NODE_ENV`**: Node environment setting

## How Docker Compose Uses These

The `compose.yml` file reads from your `.env` file and passes variables to containers:

````yaml
# API container
environment:
  - SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}
  - SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}
  # ... etc


## Production Notes

For production deployment:

1. **Change `SESSION_SECRET`** to a strong random string
2. **Update URLs** to your production domains
3. **Add to Spotify Dashboard**: Your production redirect URI
4. **Use secure Redis**: Not the Docker service
5. **Set `ENVIRONMENT=production`**

Example production `.env`:

```bash
SPOTIFY_CLIENT_ID=your_prod_client_id
SPOTIFY_CLIENT_SECRET=your_prod_client_secret
SPOTIFY_REDIRECT_URI=https://api.yourdomain.com/auth/spotify/callback
APP_URL=https://yourdomain.com
API_URL=https://api.yourdomain.com
SESSION_SECRET=very-long-random-string-here
ENVIRONMENT=production
NODE_ENV=production
REDIS_URL=redis://your-redis-host:6379
````
