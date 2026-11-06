import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  base: './',
  plugins: [preact(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['apple-touch-icon.png'],
    manifest: { name: 'Treino', short_name: 'Treino', start_url: './', scope: './',
      display: 'standalone', background_color: '#0e0e0c', theme_color: '#0e0e0c',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] },
    workbox: { maximumFileSizeToCacheInBytes: 5000000, globIgnores: ['ocr/**'],
      runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.includes('/ocr/'), handler: 'CacheFirst', options: { cacheName: 'ocr', cacheableResponse: { statuses: [0, 200] } } }], globPatterns: ['**/*.{js,css,html,png,svg,woff2}'] }
  })]
})
