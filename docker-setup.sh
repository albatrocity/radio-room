#!/bin/bash

# Listening Room Docker Setup Script

set -e

echo "🎵 Listening Room Docker Setup"
echo "=========================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo ""
    echo "Please create a .env file with the following variables:"
    echo ""
    cat << 'EOF'
# Required: Get from https://developer.spotify.com/dashboard
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback

# Application Configuration
APP_URL=http://localhost:8000
REDIS_URL=redis://redis:6379
SESSION_SECRET=$(openssl rand -base64 32)
PORT=3000
ENVIRONMENT=development
EOF
    echo ""
    read -p "Would you like to create a template .env file now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cat > .env << 'ENVEOF'
# Spotify OAuth Credentials
# Get these from https://developer.spotify.com/dashboard/applications
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3000/auth/spotify/callback

# Application URLs
APP_URL=http://localhost:8000

# Redis (default for docker-compose)
REDIS_URL=redis://redis:6379

# Session
SESSION_SECRET=$(openssl rand -base64 32)

# Server
PORT=3000
ENVIRONMENT=development
ENVEOF
        echo "✅ Created .env file"
        echo "⚠️  Please edit .env and add your Spotify credentials!"
        exit 1
    else
        exit 1
    fi
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if Spotify credentials are configured
if grep -q "your_spotify_client_id" .env 2>/dev/null; then
    echo "⚠️  Warning: You still need to configure your Spotify credentials in .env"
    echo ""
fi

echo "📦 Building and starting services..."
echo ""

# Build and start
docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo "✅ Services started successfully!"
    echo ""
    echo "🌐 Access your application:"
    echo "   Web App:  http://localhost:8000"
    echo "   API:      http://localhost:3000"
    echo "   Redis:    localhost:6379"
    echo ""
    echo "📝 View logs:"
    echo "   docker-compose logs -f"
    echo ""
    echo "🛑 Stop services:"
    echo "   docker-compose down"
    echo ""
    echo "🔐 To authenticate with Spotify:"
    echo "   1. Go to http://localhost:3000/auth/spotify/login"
    echo "   2. Log in with your Spotify account"
    echo "   3. You'll be redirected back to the app"
    echo ""
else
    echo ""
    echo "❌ Failed to start services. Check logs:"
    echo "   docker-compose logs"
    exit 1
fi

