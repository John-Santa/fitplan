// The service worker is registered at startup, not when PwaPrompts mounts: a
// new install that stays on the welcome screen must already work offline.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

function fakeServiceWorker(reg: object) {
  const register = vi.fn(async () => reg)
  vi.stubGlobal('navigator', {
    serviceWorker: { register, controller: {}, addEventListener: vi.fn() },
  })
  vi.stubGlobal('document', { addEventListener: vi.fn() })
  return register
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('registerServiceWorker', () => {
  it('registers sw.js under the base path once, with no component mounted', async () => {
    vi.resetModules()
    vi.stubEnv('PROD', true)
    const register = fakeServiceWorker({ waiting: null, installing: null, addEventListener: vi.fn() })
    const { registerServiceWorker } = await import('./useUpdatePrompt')

    registerServiceWorker()
    registerServiceWorker()

    const base = import.meta.env.BASE_URL
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith(`${base}sw.js`, { scope: base })
  })

  it('a new version found before the prompt mounts is still offered by useUpdatePrompt', async () => {
    vi.resetModules()
    vi.stubEnv('PROD', true)
    const waiting = { state: 'installed', postMessage: vi.fn(), addEventListener: vi.fn() }
    fakeServiceWorker({ waiting, installing: null, addEventListener: vi.fn() })
    const { registerServiceWorker, useUpdatePrompt } = await import('./useUpdatePrompt')

    registerServiceWorker()
    await new Promise(r => setTimeout(r, 0))

    function Probe() {
      return <span>{String(useUpdatePrompt().needRefresh)}</span>
    }
    expect(renderToString(<Probe />)).toContain('true')
  })

  it('does nothing outside the production build', async () => {
    vi.resetModules()
    vi.stubEnv('PROD', false)
    const register = fakeServiceWorker({})
    const { registerServiceWorker } = await import('./useUpdatePrompt')

    registerServiceWorker()

    expect(register).not.toHaveBeenCalled()
  })
})
