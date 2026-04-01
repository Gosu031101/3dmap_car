import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    target: ['es2015', 'chrome64', 'firefox78', 'safari12', 'edge79'],
    cssTarget: ['chrome64', 'firefox78', 'safari12', 'edge79'],
  },
})
