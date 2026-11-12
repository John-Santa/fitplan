// Node environment: the view is rendered to a string and the markup is checked.
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('../../../lib/store', () => ({
  useStore: () => ({ config: { heightCm: 175, goal: {} }, saveMeasurement: async () => {}, deleteMeasurement: async () => {} }),
  useDerivedMeasurements: () => [
    { date: '2026-01-01', weight: 80, bmi: 26, ffmi: 20 },
    { date: '2026-02-01', weight: 79, bmi: 25.8, ffmi: 20 },
  ],
}))

import Measure from './Measure'

describe('Medir', () => {
  it('tiene exactamente un h1', () => {
    const html = renderToString(<Measure />)
    expect(html.match(/<h1\b/g) ?? []).toHaveLength(1)
    expect(html).toContain('<h1>Cuerpo</h1>')
  })
})
