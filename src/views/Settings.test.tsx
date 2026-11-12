// El entorno de vitest es 'node': se renderiza a string, sin DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { AccountCard } from './Settings'
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
