import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

// Extra worker code for local reminders (notification click + periodic sync).
// The generateSW worker loads it with importScripts, so the strategy stays the
// same. Emitted verbatim, next to sw.js, so the relative import resolves under
// any base path.
const REMINDERS_SW = 'sw-reminders.js'
const remindersSw = {
  name: 'magnifit-reminders-sw',
  generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
    this.emitFile({ type: 'asset', fileName: REMINDERS_SW, source: readFileSync(new URL('./src/sw/reminders-sw.js', import.meta.url), 'utf8') })
  },
}

// En GitHub Pages de proyecto la app vive en https://usuario.github.io/<repo>/
// El workflow inyecta VITE_BASE=/<repo>/. En local queda en "/".
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    remindersSw,
    VitePWA({
      registerType: 'autoUpdate',
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
        importScripts: [REMINDERS_SW],
      },
      devOptions: { enabled: false },
    }),
  ],
})
