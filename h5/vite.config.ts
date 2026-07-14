import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ command }) => ({
  base: process.env.VITE_PUBLIC_BASE || (command === 'build' ? '/h5/' : '/'),
  plugins: [vue()],
  server: {
    port: 5174,
    allowedHosts: ['.cpolar.top', '.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}))
