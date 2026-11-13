import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { StrengthSession } from '../../../lib/types'

// Block of 12 weeks starting 2026-08-20: 2026-10-01 is day 42, so week 7
// (the "la mitad de peso" deload of the default plan).
const BLOCK_START = '2026-08-20'

vi.mock('../../../lib/store', async () => {
  const { DEFAULT_PLAN } = await import('../../../lib/defaultPlan')
  const { DEFAULT_CONFIG } = await import('../../../lib/plan')
  return {
    useStore: () => ({
      sessions: [], meta: [], saveMeta: async () => {}, savePlan: async () => {},
      plan: DEFAULT_PLAN, config: { ...DEFAULT_CONFIG, blockStart: BLOCK_START },
    }),
  }
})

const { default: StrengthBody } = await import('./StrengthBody')

const session = (date: string, startedAt: number): StrengthSession => ({
  id: 'late', kind: 'strength', routineId: 'espalda-d1', date, startedAt, finishedAt: null, notes: '', sets: [],
})

const render = (s: StrengthSession) =>
  renderToString(<StrengthBody session={s} onChange={() => {}} onFinish={() => {}} onDiscard={() => {}} />).replace(/<!-- -->/g, '')

describe('StrengthBody block week', () => {
  it('uses the week of the session date for a session logged late for a past day', () => {
    // Typed in on 2026-12-20 (week 18, after the block) for 2026-10-01.
    const html = render(session('2026-10-01', Date.parse('2026-12-20T09:00:00')))
    expect(html).toContain('Semana 7 de 12')
    expect(html).toContain('la mitad de peso')
  })

  it('keeps the week of a session done on its own day', () => {
    const html = render(session('2026-09-03', Date.parse('2026-09-03T09:00:00'))) // day 14: week 3
    expect(html).toContain('Semana 3 de 12')
  })
})
