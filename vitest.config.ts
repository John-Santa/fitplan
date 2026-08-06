import { defineConfig } from 'vitest/config'

// Vitest lee vite.config.ts por defecto, lo que instanciaria VitePWA y
// @vitejs/plugin-react en cada corrida de pruebas unitarias. Este archivo
// separado con plugins: [] evita eso: las pruebas de aca son funciones
// puras de src/lib, no necesitan ni el plugin de React ni el service worker.
export default defineConfig({
  plugins: [],
  test: {
    environment: 'node',
  },
})
