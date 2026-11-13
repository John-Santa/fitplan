import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { guardImportScripts } from './src/features/reminders/lib/swImportGuard'

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

// A failed import of the reminders code must never take the precache and the
// SKIP_WAITING listener down with it: once VitePWA has written sw.js (its
// closeBundle runs in the normal order), wrap that import in a try/catch.
let outDir = 'dist'
const guardRemindersImport = {
  name: 'magnifit-guard-reminders-import',
  apply: 'build' as const,
  configResolved(config: { root: string; build: { outDir: string } }) {
    outDir = resolve(config.root, config.build.outDir)
  },
  closeBundle: {
    order: 'post' as const,
    sequential: true,
    handler() {
      const sw = resolve(outDir, 'sw.js')
      writeFileSync(sw, guardImportScripts(readFileSync(sw, 'utf8'), REMINDERS_SW))
    },
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
        screenshots: [
          {
            src: 'screenshots/home-narrow.png',
            sizes: '540x960',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Pantalla de inicio con el entrenamiento del día',
          },
          {
            src: 'screenshots/home-wide.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Pantalla de inicio en pantalla ancha',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Only crawlers (og-image) and the install UI (manifest screenshots)
        // fetch these; precaching them would cost every install ~250 KB.
        // The reminders script is cached by the browser as part of the worker
        // (importScripts); precaching it too would make a 404 fail the install.
        globIgnores: ['og-image.png', 'screenshots/**', REMINDERS_SW],
        navigateFallback: base + 'index.html',
        cleanupOutdatedCaches: true,
        importScripts: [REMINDERS_SW],
      },
      devOptions: { enabled: false },
    }),
    guardRemindersImport,
  ],
})
