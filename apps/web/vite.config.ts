import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite(), // Must be before react()
    react(),
  ],
  server: {
    port: 8000,
    host: '0.0.0.0',
  },
  envPrefix: 'VITE_',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})

