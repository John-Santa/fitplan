import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import MovedNotice, { isPagesBuild, MOVED_NOTICE_TEXT } from './MovedNotice'
import App from './App'

afterEach(() => vi.unstubAllEnvs())

describe('moved notice', () => {
  it('shows the notice on the GitHub Pages build (non-root base)', () => {
    const html = renderToString(<MovedNotice baseUrl="/fitapp/" />)
    expect(html).toContain('MagniFit se mudó: exporta tu respaldo y ábrelo en app.magnifit.co')
    expect(html).toContain('<button')
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
})
