import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Session, StrengthSession, TrainingPlan } from '../../../lib/types'
import WeekReview from './WeekReview'

const routines = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id, archived: false }))
const plan = {
  routines, weeks: 12,
  phases: [{ fromWeek: 3, toWeek: 6, goal: 'Progresión doble: sumar reps y peso cada semana' }],
} as unknown as TrainingPlan
let n = 0
const lift = (routineId: string, date: string, weight: number): StrengthSession => ({
  id: `w${n++}`, kind: 'strength', routineId, date, startedAt: 1, finishedAt: 2, notes: '',
  sets: [{ exerciseId: 'leg-press', setIndex: 0, weight, reps: 184, done: true }],
})
const config = { blockStart: '2026-10-19', blockEnd: '2027-01-10', habitCheckIns: ['2026-11-18', '2026-11-20'] }
const sessions: Session[] = [
  lift('a', '2026-11-16', 100), lift('b', '2026-11-17', 100), lift('c', '2026-11-19', 100), lift('d', '2026-11-21', 100),
  lift('a', '2026-11-09', 200),
]

describe('WeekReview', () => {
  // Today is Wednesday 2026-11-25: the last closed week is 16..22 nov.
  const html = renderToString(<WeekReview plan={plan} sessions={sessions} config={config} today="2026-11-25" />)
  it('shows the closed week with done of target, walks, volume and block line', () => {
    expect(html).toContain('Semana del 16 al 22 nov')
    expect(html).toContain('Entrenamientos: 4 de 5')
    expect(html).toContain('Caminatas: 2')
    expect(html).toContain('Volumen: 73.600 kg')
    expect(html).toContain('Semana 5 de 12 · Progresión doble: sumar reps y peso cada semana')
    expect(html).toContain('Semana anterior')
  })
  it('compares volume with the week before', () => {
    expect(html).toContain('+100 % frente a la semana anterior')
  })
  it('without any activity shows an empty state', () => {
    const empty = renderToString(<WeekReview plan={plan} sessions={[]} config={{ ...config, habitCheckIns: [] }} today="2026-11-25" />)
    expect(empty).toContain('Aún no hay semanas cerradas')
  })
})
