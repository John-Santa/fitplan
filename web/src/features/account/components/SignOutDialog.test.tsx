// The dialog body is presentational, so it renders to a string in the node
// environment (the BottomSheet wrapper needs a DOM and is not rendered here).
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { SignOutDialogBody } from './SignOutDialog'

const noop = () => {}
const render = (props: Partial<Parameters<typeof SignOutDialogBody>[0]> = {}) =>
  renderToString(<SignOutDialogBody phase="ready" pending={0} onKeep={noop} onErase={noop} onCancel={noop} {...props} />)

describe('SignOutDialogBody', () => {
  it('offers both ways out and a cancel', () => {
    const html = render()
    expect(html).toContain('Mantener datos')
    expect(html).toContain('Borrar dispositivo')
    expect(html).toContain('Cancelar')
  })

  it('shows no warning when everything was synced', () => {
    expect(render()).not.toContain('se perderá')
  })

  it('warns how many changes would be lost when they could not be synced', () => {
    expect(render({ pending: 3 })).toContain('3 cambios todavía no se sincronizaron y se perderán si borras el dispositivo.')
  })

  it('says so when the pending changes could not be counted', () => {
    expect(render({ checkFailed: true })).toContain('No se pudo comprobar si hay cambios sin sincronizar.')
  })

  it('while syncing it explains the wait and blocks both choices', () => {
    const html = render({ phase: 'checking' })
    expect(html).toContain('Sincronizando los cambios pendientes')
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('shows the error of a failed attempt', () => {
    expect(render({ error: 'No se pudo cerrar la sesión.' })).toContain('No se pudo cerrar la sesión.')
  })
})
