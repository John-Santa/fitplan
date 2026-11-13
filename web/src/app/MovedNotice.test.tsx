import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import MovedNotice, { isPagesBuild, MOVED_NOTICE_TEXT } from './MovedNotice'
import App, { WelcomeScreen } from './App'
import { StoreProvider } from '../lib/store'

afterEach(() => vi.unstubAllEnvs())

describe('moved notice', () => {
  it('shows the notice on the GitHub Pages build (non-root base)', () => {
    const html = renderToString(<MovedNotice baseUrl="/fitapp/" />)
    expect(html).toContain('MagniFit se mudó: exporta tu respaldo y ábrelo en app.magnifit.co')
    expect(html).toContain('<button')
  })

  it('announces the Pages retirement date', () => {
    const html = renderToString(<MovedNotice baseUrl="/fitapp/" />)
    expect(html).toContain('Esta versión deja de funcionar el 12 dic 2026.')
  })

  it('does not render anything on the Render build (root base)', () => {
    expect(renderToString(<MovedNotice baseUrl="/" />)).toBe('')
  })

  it('detects the build from the base URL', () => {
    expect(isPagesBuild('/fitapp/')).toBe(true)
    expect(isPagesBuild('/')).toBe(false)
    expect(MOVED_NOTICE_TEXT).toContain('app.magnifit.co')
  })

  it('App on the Render build renders unchanged, without the notice', () => {
    vi.stubEnv('BASE_URL', '/')
    expect(renderToString(<App />)).not.toContain('se mudó')
  })

  it('App on the Pages build shows the notice', () => {
    vi.stubEnv('BASE_URL', '/fitapp/')
    expect(renderToString(<App />)).toContain('se mudó')
  })

  // S1: a Pages user on a new install lands on the welcome; the notice must
  // reach them there too, above the first step.
  it('the welcome on the Pages build shows the notice above the first step', () => {
    vi.stubEnv('BASE_URL', '/fitapp/')
    const html = renderToString(<StoreProvider><WelcomeScreen /></StoreProvider>)
    expect(html).toContain(MOVED_NOTICE_TEXT)
    expect(html).toContain('Te damos la bienvenida a MagniFit')
    expect(html.indexOf(MOVED_NOTICE_TEXT)).toBeLessThan(html.indexOf('Te damos la bienvenida a MagniFit'))
  })

  it('the welcome on the Render build has no notice', () => {
    vi.stubEnv('BASE_URL', '/')
    const html = renderToString(<StoreProvider><WelcomeScreen /></StoreProvider>)
    expect(html).toContain('Te damos la bienvenida a MagniFit')
    expect(html).not.toContain('se mudó')
  })
})
