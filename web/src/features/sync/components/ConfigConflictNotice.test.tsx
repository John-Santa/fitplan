// Vitest runs in node: rendered to a string, no DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ConfigConflictNotice } from './ConfigConflictNotice'

describe('ConfigConflictNotice', () => {
  it('names what changed on another device and offers to dismiss it', () => {
    const html = renderToString(<ConfigConflictNotice fields={['Altura', 'Intención del lunes']} onDismiss={() => {}} />)
    expect(html).toContain('Altura, Intención del lunes: esto cambió en otro dispositivo y se conservó esa versión.')
    expect(html).toContain('Entendido')
  })

  it('renders nothing without discarded fields', () => {
    expect(renderToString(<ConfigConflictNotice fields={[]} onDismiss={() => {}} />)).toBe('')
  })
})
