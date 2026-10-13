import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxy = {
  '/api': 'http://127.0.0.1:8000',
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The page calls /api/... on this dev server. Vite forwards those calls to FastAPI.
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
})
