import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { TrainingPlan } from '../../../lib/types'
import { DEFAULT_PLAN } from '../../../lib/defaultPlan'
import WarmupEditor from './WarmupEditor'

const render = (plan: TrainingPlan) =>
  renderToString(<WarmupEditor plan={plan} onBack={() => {}} onCommit={() => {}} />)

describe('WarmupEditor', () => {
  it('lists every warm-up exercise with the same move, edit and remove actions as a routine', () => {
    const html = render(DEFAULT_PLAN)
    const n = DEFAULT_PLAN.warmup.slots.length
    expect(html.match(/aria-label="Quitar /g)).toHaveLength(n)
    expect(html.match(/aria-label="Editar /g)).toHaveLength(n)
    expect(html.match(/aria-label="Subir /g)).toHaveLength(n)
    expect(html.match(/aria-label="Bajar /g)).toHaveLength(n)
    expect(html).toContain('Agregar ejercicio')
  })

  it('has no routine fields and no archive action', () => {
    const html = render(DEFAULT_PLAN)
    expect(html).not.toContain('id="pe-r-name"')
    expect(html).not.toContain('Archivar')
  })

  it('shows an empty state when the warm-up has no exercises', () => {
    const html = render({ ...DEFAULT_PLAN, warmup: { ...DEFAULT_PLAN.warmup, slots: [] } })
    expect(html).toContain('Sin ejercicios')
    expect(html).toContain('Agregar ejercicio')
  })
})
