// El entorno de vitest es 'node': se renderiza a string, sin DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ReminderBanner } from './ReminderBanner'

describe('ReminderBanner', () => {
  it('shows the planned time and place with open and dismiss actions', () => {
    const html = renderToString(
      <ReminderBanner reminder={{ key: 'k', date: '2026-11-09', time: '07:30', place: 'Gym', at: 0 }} onOpen={() => {}} onDismiss={() => {}} />,
    )
    expect(html).toContain('role="status"')
    expect(html).toContain('07:30 · Gym')
    expect(html).toContain('Ir a Hoy')
    expect(html).toContain('Descartar')
  })

  it('renders nothing without a pending reminder', () => {
    expect(renderToString(<ReminderBanner reminder={null} onOpen={() => {}} onDismiss={() => {}} />)).toBe('')
  })
})
