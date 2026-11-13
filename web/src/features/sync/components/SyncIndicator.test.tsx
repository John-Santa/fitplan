// El entorno de vitest es 'node': se renderiza a string, sin DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { SyncChip } from './SyncIndicator'

const base = { state: 'idle' as const, pending: 0, lastSyncAt: 1, lastError: null, rejected: 0, rejectedError: null, backupAt: null }

describe('SyncChip', () => {
  it('muestra "Conectando con el servidor…" durante el arranque en frío', () => {
    const html = renderToString(<SyncChip status={{ ...base, state: 'connecting' }} />)
    expect(html).toContain('Conectando con el servidor…')
    expect(html).toContain('sync-dot busy')
  })

  it('sin conexión y con cambios pendientes', () => {
    const html = renderToString(<SyncChip status={{ ...base, state: 'offline', pending: 2 }} />)
    expect(html).toContain('Sin conexión · 2 cambios pendientes')
  })

  it('sesión expirada: el chip es un botón que lleva a Perfil', () => {
    const html = renderToString(<SyncChip status={{ ...base, state: 'auth_expired' }} onOpen={() => {}} />)
    expect(html).toContain('Tu sesión expiró, vuelve a iniciar sesión')
    expect(html).toContain('<button')
  })

  it('en reposo es solo texto, sin botón', () => {
    const html = renderToString(<SyncChip status={base} onOpen={() => {}} />)
    expect(html).toContain('Sincronizado')
    expect(html).not.toContain('<button')
  })
})
