import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '0.0.0.0',
    // Overridable so the dev UI can be served on whichever port the developer
    // browses to, with the API moved out of its way.
    port: Number(process.env.DEV_WEB_PORT) || 3403,
    allowedHosts: ['.internal'],
    proxy: {
      // Proxy API and WebSocket requests to the dev backend (mirrors Docker/nginx behaviour)
      '/api': {
        target: `http://localhost:${process.env.DEV_API_PORT || 3303}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${process.env.DEV_API_PORT || 3303}`,
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
