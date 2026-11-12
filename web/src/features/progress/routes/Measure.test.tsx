import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Measurement } from '../../../lib/types'
import { UNSET_GOAL } from '../../../lib/plan'

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  goal: { weight: 78, fatMass: 12, muscle: 38, waist: 82 } as Record<string, number>,
}))

vi.mock('../../../lib/store', () => ({
  useStore: () => ({
    config: { blockEnd: '2027-02-07', heightCm: 175, goal: state.goal },
    saveMeasurement: async () => {},
    deleteMeasurement: async () => {},
  }),
  useDerivedMeasurements: () => state.rows,
}))

const { default: Measure } = await import('./Measure')
const { derive } = await import('../../../lib/calc')

const row = (m: Measurement) => derive(m, 175)

describe('Measure', () => {
  it('renders with no measurements (a new install that skipped the measures step)', () => {
    state.rows = []
    const html = renderToString(<Measure />)
    expect(html).toContain('<h1>Cuerpo</h1>')
    expect(html).not.toContain('medición 0')
  })

  it('keeps the date and count header when measurements exist', () => {
    state.rows = [row({ date: '2026-11-16', weight: 80 }), row({ date: '2026-11-23', weight: 79 })]
    const html = renderToString(<Measure />)
    expect(html).toContain('medición 2')
    expect(html).toContain('meta 78,0 kg')
  })

  it('hides goals that were left unset in the welcome', () => {
    state.rows = [row({ date: '2026-11-16', weight: 80 })]
    state.goal = { weight: UNSET_GOAL, fatMass: UNSET_GOAL, muscle: UNSET_GOAL, waist: UNSET_GOAL }
    const html = renderToString(<Measure />)
    expect(html).not.toContain('meta 0,0')
  })
})
