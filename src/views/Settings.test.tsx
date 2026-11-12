// El entorno de vitest es 'node': se renderiza a string, sin DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { AccountCard, SyncStatusLines } from './Settings'
import { authEnabled } from '../lib/auth'

describe('AccountCard sin Clerk configurado', () => {
  it('authEnabled es falso sin VITE_CLERK_PUBLISHABLE_KEY', () => {
    expect(authEnabled).toBe(false)
  })

  it('muestra solo la línea de datos locales, sin botones de sesión', () => {
    const html = renderToString(<AccountCard />)
    expect(html).toContain('Tus datos viven solo en este teléfono.')
    expect(html).not.toContain('Inicia sesión')
    expect(html).not.toContain('<button')
  })
})

describe('estado de sincronización en la tarjeta Cuenta', () => {
  const status = { state: 'idle' as const, pending: 2, lastSyncAt: 1_000, lastError: null }

  it('muestra el estado y el botón "Sincronizar ahora" en vez de "próximamente"', () => {
    const html = renderToString(<SyncStatusLines status={status} onSync={() => {}} now={1_000 + 3 * 60_000} />)
    expect(html).toContain('Sincronizado hace 3 min')
    expect(html).toContain('2 cambios pendientes')
    expect(html).toContain('Sincronizar ahora')
    expect(html).not.toContain('próximamente')
  })

  it('sin conexión avisa que se sincroniza al volver la señal', () => {
    const html = renderToString(<SyncStatusLines status={{ ...status, state: 'offline', lastError: 'Sin conexión' }} onSync={() => {}} />)
    expect(html).toContain('Sin conexión: se sincroniza al volver la señal')
  })
})
