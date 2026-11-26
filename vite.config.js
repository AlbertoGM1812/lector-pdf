import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Rutas relativas: así funciona igual en el ordenador, por Wi-Fi
  // y en GitHub Pages (https://usuario.github.io/lector-pdf/).
  base: './',
  build: {
    // Safari de iPadOS 17 o más nuevo.
    target: ['safari15', 'es2020'],
    // PDF.js es grande; es normal y se guarda una sola vez en el iPad.
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Lector PDF',
        short_name: 'Lector PDF',
        description: 'Lee tus PDFs como un libro',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f7f3ea',
        theme_color: '#f7f3ea',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Todo lo necesario para abrir la app sin internet (incluido el worker de PDF.js).
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
        globIgnores: ['cmaps/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Los "cmaps" (tablas para letras de idiomas asiáticos) se guardan al usarse.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/cmaps/'),
            handler: 'CacheFirst',
            options: { cacheName: 'cmaps', expiration: { maxEntries: 200 } },
          },
        ],
      },
    }),
  ],
});
