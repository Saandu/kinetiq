import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3100,
  },
  build: {
    target: 'es2022',
    // the app is small enough that a single chunk beats a waterfall of requests
    chunkSizeWarningLimit: 700,
  },
})
