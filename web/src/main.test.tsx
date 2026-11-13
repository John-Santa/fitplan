// main.tsx registers the service worker before the app (and the welcome
// screen) renders, so a first visit is offline-capable right away.
import { describe, expect, it, vi } from 'vitest'

const registerServiceWorker = vi.fn()

vi.mock('./features/pwa/lib/useUpdatePrompt', () => ({ registerServiceWorker }))
// The provider never resolves: this test only looks at what runs at startup.
vi.mock('./app/providers', () => ({ loadProvider: () => new Promise(() => {}) }))
vi.mock('./app/App', () => ({ default: () => null }))
vi.mock('react-dom/client', () => ({ createRoot: vi.fn() }))

describe('main', () => {
  it('registers the service worker at startup, before any screen mounts', async () => {
    await import('./main')
    expect(registerServiceWorker).toHaveBeenCalledTimes(1)
  })
})
