import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev the client is served by Vite but the game server (Socket.io)
    // runs separately on :3001. Proxy the realtime connection through so the
    // client's `io()` — which targets its own origin — reaches the server.
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
