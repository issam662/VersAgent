import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// NOTE: mkcert removed - its self-signed certs are only trusted locally,
// which prevents remote PCs from connecting. The frontend runs on HTTP.
// The backend (port 3002) continues to use its own HTTPS certificate.
export default defineConfig({
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'https://localhost:3002',
        changeOrigin: true,
        secure: false, // Allow self-signed certs for backend
      },
      '/uploads': {
        target: 'https://localhost:3002',
        changeOrigin: true,
        secure: false, // Allow self-signed certs for backend
      },
    },
  },
  plugins: [
    react(),
  ],
})
