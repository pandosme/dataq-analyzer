import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 3403,
    allowedHosts: ['.internal'],
    proxy: {
      // Proxy API and WebSocket requests to the dev backend (mirrors Docker/nginx behaviour)
      '/api': {
        target: 'http://localhost:3303',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3303',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
})
