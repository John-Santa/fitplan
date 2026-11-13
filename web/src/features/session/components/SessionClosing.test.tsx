import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { SetLog, StrengthSession } from '../../../lib/types'
import { todayISO } from '../../../lib/calc'

const state = vi.hoisted(() => ({ sessions: [] as unknown[] }))

vi.mock('../../../lib/store', async () => {
  const { DEFAULT_PLAN } = await import('../../../lib/defaultPlan')
  const { DEFAULT_CONFIG } = await import('../../../lib/plan')
  return {
    useStore: () => ({ sessions: state.sessions, plan: DEFAULT_PLAN, config: { ...DEFAULT_CONFIG, habitCheckIns: [] } }),
  }
})

const { default: SessionClosing } = await import('./SessionClosing')

const sets = (weight: number): SetLog[] =>
  [0, 1, 2].map(i => ({ exerciseId: 'leg-press', setIndex: i, weight, reps: 10, done: true }))

const session = (id: string, date: string, weight: number): StrengthSession => ({
  id, kind: 'strength', routineId: 'espalda-d1', date,
  startedAt: Date.parse(date + 'T10:00:00'), finishedAt: Date.parse(date + 'T10:45:00'), notes: '', sets: sets(weight),
})

describe('SessionClosing', () => {
  it('summarizes the finished session against the saved history, with plan names', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    // Yesterday and today kept; nothing before, so the streak is exactly 2.
    const prev = session('prev', todayISO(yesterday), 60)
    const done = session('done', todayISO(), 65)
    state.sessions = [prev] // the store may not hold the finished session yet
    const html = renderToString(<SessionClosing finished={done} onDone={() => {}} />).replace(/<!-- -->/g, '')
    expect(html).toContain('Tren inferior A · 45 min')
    expect(html).toContain('Volumen total: 1.950 kg')
    expect(html).toContain('Frente a la sesión anterior: +150 kg de volumen · 0 series')
    expect(html).toContain('Prensa de piernas (leg press): 65 kg, nuevo mejor peso')
    expect(html).toContain('Racha: 2 días')
  })
})
