import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackRouter(), // Must be before react()
    react(),
  ],
  server: {
    port: 8000,
    host: '0.0.0.0',
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

