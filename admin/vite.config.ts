import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => ({
  base: process.env.VITE_PUBLIC_BASE || (command === 'build' ? '/admin/' : '/'),
  plugins: [vue()],
  server: {
    port: 5173,
    allowedHosts: ['.cpolar.top', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}))
