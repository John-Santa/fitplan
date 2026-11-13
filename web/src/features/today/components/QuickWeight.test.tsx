// The vitest environment is 'node': rendered to a string, no DOM.
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

const state = vi.hoisted(() => ({ measurements: [] as { date: string; weight: number }[] }))

vi.mock('../../../lib/store', () => ({
  useStore: () => ({ measurements: state.measurements, mergeMeasurement: async () => {} }),
}))

const { default: QuickWeight, WeightForm } = await import('./QuickWeight')

describe('quick weight entry in Hoy', () => {
  it('renders the one-tap "Anotar peso" entry and keeps the sheet closed', () => {
    const html = renderToString(<QuickWeight />)
    expect(html).toContain('Anotar peso')
    expect(html).not.toContain('Peso de hoy')
  })
})

describe('weight sheet body', () => {
  it('has one decimal input prefilled with the given weight and a Guardar button', () => {
    const html = renderToString(<WeightForm value="79.5" error={null} onChange={() => {}} onSave={() => {}} />)
    expect(html).toContain('value="79.5"')
    expect(html).toContain('inputMode="decimal"')
    expect(html).toContain('Guardar')
    expect(html.match(/<input/g)).toHaveLength(1)
    expect(html).not.toContain('role="alert"')
  })

  it('shows the rejection message when the value was refused', () => {
    const html = renderToString(<WeightForm value="" error="Escribe tu peso en kg" onChange={() => {}} onSave={() => {}} />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Escribe tu peso en kg')
  })
})
