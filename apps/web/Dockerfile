# Simple Vite development Dockerfile
# Production builds are handled by Netlify
FROM node:22-alpine

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/
COPY packages/ ./packages/

# Install dependencies
RUN npm ci

# Copy source code (volumes will override in docker-compose for hot reload)
COPY . .

# Set working directory to web app
WORKDIR /app/apps/web

# Expose Vite dev server port
EXPOSE 8000

# Run Vite dev server with host binding for Docker
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8000"]