// The vitest environment is 'node': rendered to a string, no DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import Welcome, { MEDICAL_NOTICE } from './Welcome'
import { StoreProvider } from '../../../lib/store'

describe('welcome first step', () => {
  it('opens with the medical notice and offers to restore a backup', () => {
    const html = renderToString(<StoreProvider><Welcome /></StoreProvider>)
    expect(html).toContain('Te damos la bienvenida a MagniFit')
    expect(html).toContain('Aviso médico')
    expect(html).toContain(MEDICAL_NOTICE)
    expect(html).toContain('Restaurar un respaldo')
    // Without login configured there is no account step.
    expect(html).toContain('Paso 1 de 5')
  })
})
