import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages serves the app from /matharium/ (set by the deploy job)
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registered in src/io/pwa.ts so the UI can offer updates
      manifest: {
        name: 'Matharium',
        short_name: 'Matharium',
        description: 'Graph functions, solve equations, build geometry and plot in 3D. Works offline.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        theme_color: '#000000',
        background_color: '#0D0E0D',
        lang: 'en',
        categories: ['education', 'productivity', 'utilities'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        file_handlers: [{ action: '.', accept: { 'application/x-matharium+json': ['.mth'] } }],
      },
      workbox: {
        // app code (incl. the lazy 3D chunk), KaTeX fonts and the latin/arabic font subsets work offline
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', 'assets/KaTeX_*.woff2', 'assets/*-latin-*.woff2', 'assets/*-arabic-*.woff2'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 80 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1600 },
  test: { environment: 'node', exclude: ['e2e/**', 'node_modules/**'] },
} as never);
