// El entorno de vitest es 'node': se renderiza a string, sin DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import Settings, { AccountCard, SyncStatusLines } from './Settings'
import { authEnabled } from '../lib/auth'
import { DisciplineCtx, StoreProvider } from '../../../lib/store'
import { disciplineActions } from '../../../lib/disciplineSelection'
import { mergeConfig } from '../../../lib/plan'
import type { SessionKind } from '../../../lib/types'

describe('Ajustes regrouped by concern (S9)', () => {
  const render = (list: SessionKind[], props: { onBack?: () => void } = {}) => {
    const api = disciplineActions({ config: mergeConfig({}), stored: null, setStored: () => {}, saveConfig: async () => {} })
    return renderToString(
      <StoreProvider>
        <DisciplineCtx.Provider value={{ ...api, list }}>
          <Settings {...props} />
        </DisciplineCtx.Provider>
      </StoreProvider>,
    ).replace(/<!-- -->/g, '')
  }

  it('hides the pool length while Natación is not listed', () => {
    expect(render(['strength'])).not.toContain('Largo de la piscina (m)')
  })

  it('shows the pool length when Natación is listed', () => {
    expect(render(['strength', 'swim'])).toContain('Largo de la piscina (m)')
    expect(render(['swim'])).toContain('Largo de la piscina (m)')
  })

  it('renders the groups in order, keeping the title and footer', () => {
    const html = render(['strength', 'swim'])
    const order = ['Cuenta', 'Tus datos', 'Tu cuerpo', 'Gimnasio', 'Natación', 'Zona de peligro']
      .map(t => html.indexOf(`>${t}</div>`))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('<h1>Ajustes</h1>')
    expect(html).toContain('Herramienta personal de seguimiento')
  })

  it('puts height and goals under "Tu cuerpo" and the block dates under "Gimnasio"', () => {
    const html = render(['strength'])
    const body = html.indexOf('>Tu cuerpo</div>')
    const gym = html.indexOf('>Gimnasio</div>')
    expect(html.indexOf('Estatura (cm)')).toBeGreaterThan(body)
    expect(html.indexOf('Metas del bloque')).toBeGreaterThan(body)
    expect(html.indexOf('Metas del bloque')).toBeLessThan(gym)
    expect(html.indexOf('Inicio del bloque')).toBeGreaterThan(gym)
    expect(html.indexOf('Fin del bloque')).toBeGreaterThan(gym)
  })

  it('shows no discipline chip', () => {
    expect(render(['strength', 'swim'])).not.toContain('discipline-chip')
  })

  it('renders "Volver" only when onBack is given', () => {
    expect(render(['strength'])).not.toContain('Volver')
    const html = render(['strength'], { onBack: () => {} })
    expect(html).toContain('Volver')
    expect(html.indexOf('Volver')).toBeLessThan(html.indexOf('<h1>'))
  })
})

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
  const status = { state: 'idle' as const, pending: 2, lastSyncAt: 1_000, lastError: null, rejected: 0, rejectedError: null, backupAt: null }

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

  it('con la sesión expirada muestra el aviso y deja "Sincronizar ahora" disponible', () => {
    const html = renderToString(<SyncStatusLines status={{ ...status, state: 'auth_expired', lastError: 'Tu sesión expiró, vuelve a iniciar sesión' }} onSync={() => {}} />)
    expect(html).toContain('Tu sesión expiró, vuelve a iniciar sesión')
    expect(html).toContain('2 cambios pendientes')
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Sincronizar ahora/)
  })

  it('lista cada cambio rechazado con "Reintentar" y "Descartar"', () => {
    const entries = [
      { entity: 'session' as const, key: 'a', body: { date: '2026-11-01' }, updatedAt: 1, deletedAt: null, error: 'body contains NUL', rejectedAt: 2 },
      { entity: 'measurement' as const, key: '2026-10-05', body: {}, updatedAt: 1, deletedAt: null, error: 'bad date', rejectedAt: 2 },
    ]
    const html = renderToString(<SyncStatusLines status={{ ...status, rejected: 2 }} onSync={() => {}} rejectedEntries={entries} />)
    expect(html).toContain('Sesión del 2026-11-01')
    expect(html).toContain('Medición del 2026-10-05')
    expect(html).toContain('body contains NUL')
    expect(html.match(/Reintentar/g)).toHaveLength(2)
    expect(html.match(/Descartar/g)).toHaveLength(3) // dos botones y la nota
  })

  it('sin rechazados no muestra la lista', () => {
    const html = renderToString(<SyncStatusLines status={status} onSync={() => {}} rejectedEntries={[]} />)
    expect(html).not.toContain('Reintentar')
  })

  it('sin copia previa no muestra el aviso ni el botón de descarga', () => {
    const html = renderToString(<SyncStatusLines status={status} onSync={() => {}} />)
    expect(html).not.toContain('Guardamos una copia de tus datos anteriores')
    expect(html).not.toContain('Descargar copia')
  })

  it('con copia previa del primer ingreso avisa y ofrece descargarla', () => {
    const html = renderToString(<SyncStatusLines status={{ ...status, backupAt: 5_000 }} onSync={() => {}} onDownloadBackup={() => {}} />)
    expect(html).toContain('Guardamos una copia de tus datos anteriores')
    expect(html).toContain('Descargar copia')
  })

  it('muestra cuántos cambios no se pudieron subir y el primer error', () => {
    const html = renderToString(<SyncStatusLines status={{ ...status, pending: 0, rejected: 3, rejectedError: 'body contains NUL' }} onSync={() => {}} now={1_000} />)
    expect(html).toContain('3 cambios no se pudieron subir: body contains NUL')
  })
})

describe('cuenta bloqueada por datos de otra cuenta', () => {
  const blocked = { state: 'blocked' as const, pending: 0, lastSyncAt: null, lastError: 'Esta app tiene datos de otra cuenta.', rejected: 0, rejectedError: null, backupAt: null }

  it('ofrece "Exportar y cambiar" junto a "Sincronizar ahora"', () => {
    const html = renderToString(<SyncStatusLines status={blocked} onSync={() => {}} onExportAndSwitch={() => {}} />)
    expect(html).toContain('Exportar y cambiar')
    expect(html).toContain('Sincronizar ahora')
  })

  it('no lo ofrece en los demás estados', () => {
    for (const state of ['idle', 'syncing', 'offline', 'error'] as const) {
      const html = renderToString(<SyncStatusLines status={{ ...blocked, state }} onSync={() => {}} onExportAndSwitch={() => {}} />)
      expect(html).not.toContain('Exportar y cambiar')
    }
  })

  it('no lo ofrece si no hay acción para ejecutarlo', () => {
    expect(renderToString(<SyncStatusLines status={blocked} onSync={() => {}} />)).not.toContain('Exportar y cambiar')
  })
})
