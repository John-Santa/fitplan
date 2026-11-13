import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import SessionSummary from './SessionSummary'
import type { SessionSummaryData } from '../lib/summary'

const base: SessionSummaryData = {
  volume: 4320,
  sets: 18,
  durationMs: 52 * 60_000,
  records: [],
  comparison: { kind: 'previous', volumeDelta: 180, setsDelta: 2 },
  streakDays: 12,
}

const names: Record<string, string> = { 'leg-press': 'Prensa' }
const render = (summary: SessionSummaryData) =>
  renderToString(
    <SessionSummary routineName="Tren inferior A" summary={summary} nameOf={id => names[id] ?? id} onDone={() => {}} />,
  ).replace(/<!-- -->/g, '')

describe('SessionSummary', () => {
  it('shows the title, routine, duration, total volume, comparison and streak', () => {
    const html = render(base)
    expect(html).toContain('Sesión terminada')
    expect(html).toContain('Tren inferior A · 52 min')
    expect(html).toContain('Volumen total: 4.320 kg')
    expect(html).toContain('Frente a la sesión anterior: +180 kg de volumen · +2 series')
    expect(html).toContain('Racha: 12 días')
    expect(html).toContain('>Listo<')
    expect(html).not.toContain('Récords de hoy')
  })

  it("lists today's records", () => {
    const html = render({
      ...base,
      records: [
        { exerciseId: 'leg-press', kind: 'weight', value: 65, reps: 8, previous: 60 },
        { exerciseId: 'leg-press', kind: 'volume', value: 2400, previous: 2000 },
      ],
    })
    expect(html).toContain('Récords de hoy')
    expect(html).toContain('Prensa: 65 kg, nuevo mejor peso')
    expect(html).toContain('Prensa: 2.400 kg, nuevo mejor volumen')
  })

  it('says it is the first time with the routine and shows no comparison', () => {
    const html = render({ ...base, comparison: { kind: 'first' } })
    expect(html).toContain('Primera vez con esta rutina')
    expect(html).not.toContain('Frente a la sesión anterior')
  })

  it('shows negative deltas and singular words', () => {
    const html = render({ ...base, comparison: { kind: 'previous', volumeDelta: -1250, setsDelta: -1 }, streakDays: 1 })
    expect(html).toContain('Frente a la sesión anterior: -1.250 kg de volumen · -1 serie')
    expect(html).toContain('Racha: 1 día')
  })

  it('hides the volume line when nothing had weight and the comparison when it does not apply', () => {
    const html = render({ ...base, volume: 0, comparison: null })
    expect(html).not.toContain('Volumen total')
    expect(html).not.toContain('Frente a la sesión anterior')
    expect(html).not.toContain('Primera vez con esta rutina')
  })
})
