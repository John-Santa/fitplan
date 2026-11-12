// El entorno de vitest es 'node': se renderiza a string, sin DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { CloudDangerZoneView } from './CloudDangerZone'

const noop = () => {}
const handlers = { onStart: noop, onExport: noop, onContinue: noop, onConfirm: noop, onCancel: noop }

/** El <button> cuyo texto es `label`, con sus atributos. */
function button(html: string, label: string): string | undefined {
  return html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0]
}

describe('zona de peligro de la cuenta', () => {
  it('ofrece "Eliminar cuenta" y "Borrar mis datos en la nube"', () => {
    const html = renderToString(<CloudDangerZoneView step={{ stage: 'idle' }} online busy={false} error={null} {...handlers} />)
    expect(button(html, 'Eliminar cuenta')).toBeDefined()
    expect(button(html, 'Borrar mis datos en la nube')).toBeDefined()
    expect(button(html, 'Eliminar cuenta')).not.toContain('disabled')
  })

  it('sin conexión las dos acciones quedan bloqueadas y lo explica', () => {
    const html = renderToString(<CloudDangerZoneView step={{ stage: 'idle' }} online={false} busy={false} error={null} {...handlers} />)
    expect(button(html, 'Eliminar cuenta')).toContain('disabled')
    expect(button(html, 'Borrar mis datos en la nube')).toContain('disabled')
    expect(html).toContain('Sin conexión: para borrar datos del servidor necesitas internet.')
  })

  it('la primera confirmación explica qué se borra y ofrece exportar antes', () => {
    const html = renderToString(<CloudDangerZoneView step={{ stage: 'confirm', kind: 'account' }} online busy={false} error={null} {...handlers} />)
    expect(html).toContain('Se eliminan tu cuenta y todos tus datos de salud guardados en el servidor')
    expect(html).toContain('puedes exportar un respaldo')
    expect(button(html, 'Exportar respaldo')).toBeDefined()
    expect(button(html, 'Continuar')).toBeDefined()
    expect(button(html, 'Cancelar')).toBeDefined()
    expect(button(html, 'Sí, eliminar mi cuenta')).toBeUndefined()
  })

  it('la primera confirmación de borrar datos avisa que la cuenta sigue y que otro dispositivo puede volver a subirlos', () => {
    const html = renderToString(<CloudDangerZoneView step={{ stage: 'confirm', kind: 'data' }} online busy={false} error={null} {...handlers} />)
    expect(html).toContain('Tu cuenta sigue existiendo')
    expect(html).toContain('Si otro dispositivo conserva una copia, la vuelve a subir al sincronizar.')
  })

  it('la confirmación final pide un último sí antes de borrar', () => {
    const html = renderToString(<CloudDangerZoneView step={{ stage: 'final', kind: 'account' }} online busy={false} error={null} {...handlers} />)
    expect(html).toContain('Última confirmación')
    expect(button(html, 'Sí, eliminar mi cuenta')).not.toContain('disabled')
    expect(button(html, 'Cancelar')).toBeDefined()
  })

  it('la confirmación final se bloquea sin conexión y mientras borra', () => {
    const offline = renderToString(<CloudDangerZoneView step={{ stage: 'final', kind: 'data' }} online={false} busy={false} error={null} {...handlers} />)
    expect(button(offline, 'Sí, borrar mis datos en la nube')).toContain('disabled')
    const busy = renderToString(<CloudDangerZoneView step={{ stage: 'final', kind: 'data' }} online busy error={null} {...handlers} />)
    expect(busy).toContain('Borrando…')
    expect(button(busy, 'Cancelar')).toContain('disabled')
  })

  it('muestra el error y aclara que no se borró nada del dispositivo', () => {
    const html = renderToString(<CloudDangerZoneView step={{ stage: 'final', kind: 'account' }} online busy={false} error="Error 500 del servidor" {...handlers} />)
    expect(html).toContain('No se pudo completar: Error 500 del servidor. No se borró nada de este dispositivo; puedes reintentar.')
  })
})
