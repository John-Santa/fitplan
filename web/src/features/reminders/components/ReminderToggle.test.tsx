// El entorno de vitest es 'node': se renderiza a string, sin DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { ReminderToggle } from './ReminderToggle'

const render = (support: Parameters<typeof ReminderToggle>[0]['support'], enabled = false) =>
  renderToString(<ReminderToggle support={support} enabled={enabled} onToggle={() => {}} />)

describe('ReminderToggle', () => {
  it('shows the switch off with the best-effort limit stated', () => {
    const html = render('default')
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('con la app cerrada')
  })

  it('reflects the enabled state', () => {
    expect(render('granted', true)).toContain('aria-checked="true"')
  })

  it('asks iOS users outside the installed app to install it', () => {
    expect(render('ios-install')).toContain('Instala la app para recibir recordatorios')
  })

  it('explains a blocked permission and an unsupported browser', () => {
    expect(render('denied')).toContain('Bloqueaste las notificaciones')
    expect(render('unsupported')).toContain('no admite notificaciones')
  })

  it('does not claim system notifications when only in-app reminders can work', () => {
    expect(render('denied', true)).toContain('dentro de la app')
  })
})
