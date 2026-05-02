import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

const vitePort = 8000

/** Docker bind mounts often don't propagate fs events (especially Docker Desktop). */
const pollFiles =
  process.env.VITE_DOCKER === '1' ||
  process.env.CHOKIDAR_USEPOLLING === 'true'

export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackRouter(), // Must be before react()
    react(),
  ],
  server: {
    port: vitePort,
    strictPort: true,
    host: '0.0.0.0',
    // Bind mounts — without polling, saves on the host often never reach Chokidar inside the container.
    watch: pollFiles
      ? {
          usePolling: true,
          interval: 100,
          binaryInterval: 300,
        }
      : undefined,
    // Do not set hmr.clientPort/host for Docker: port map is 8000:8000 and the injected client
    // resolves the websocket host from import.meta.url, so http://127.0.0.1:8000 and http://localhost:8000
    // both work. A fixed clientPort was breaking HMR for some setups (Vite 7 + Docker).
    proxy: {
      '/api/auth': {
        target: process.env.API_INTERNAL_URL || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  envPrefix: 'VITE_',
  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
  },
}))

