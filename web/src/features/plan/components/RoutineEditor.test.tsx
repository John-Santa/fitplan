// Vitest runs in node: components are rendered to a string, without a DOM.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { DEFAULT_PLAN } from '../../../lib/defaultPlan'
import RoutineEditor from './RoutineEditor'

describe('RoutineEditor', () => {
  const routine = DEFAULT_PLAN.routines[0]
  const html = renderToString(
    <RoutineEditor plan={DEFAULT_PLAN} routine={routine} onBack={() => {}} onCommit={() => {}} onArchive={() => {}} />,
  )

  it('shows the header fields and the archive action', () => {
    expect(html).toContain('id="pe-r-name"')
    expect(html).toContain('id="pe-r-focus"')
    expect(html).toContain('Archivar rutina')
  })

  it('lists every exercise with its move, edit and remove actions', () => {
    const count = routine.blocks.reduce((n, b) => n + b.slots.length, 0)
    expect(html.match(/aria-label="Quitar /g)).toHaveLength(count)
    expect(html.match(/aria-label="Editar /g)).toHaveLength(count)
    expect(html.match(/aria-label="Subir /g)).toHaveLength(count)
    expect(html.match(/aria-label="Bajar /g)).toHaveLength(count)
    expect(html).toContain('Agregar ejercicio')
  })
})
