import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// En GitHub Pages de proyecto la app vive en https://usuario.github.io/<repo>/
// El workflow inyecta VITE_BASE=/<repo>/. En local queda en "/".
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // 'prompt': la versión nueva espera hasta que la persona toque Actualizar,
      // y el aviso no aparece en medio de un entrenamiento (features/pwa).
      registerType: 'prompt',
      // El registro lo hace features/pwa/lib/useUpdatePrompt.ts (no un script inyectado).
      injectRegister: false,
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'MagniFit',
        short_name: 'MagniFit',
        description: 'Registra tu entrenamiento y tu composición corporal. Funciona sin conexión.',
        lang: 'es',
        id: base,
        categories: ['health', 'fitness', 'lifestyle'],
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0E1014',
        theme_color: '#0E1014',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: base + 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
})
