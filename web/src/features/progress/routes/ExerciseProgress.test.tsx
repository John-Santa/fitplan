import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { SetLog, StrengthSession } from '../../../lib/types'
import type { Series } from '../components/Chart'

const state = vi.hoisted(() => ({
  sessions: [] as unknown[],
  charts: [] as { series: Series[] }[],
}))

vi.mock('../../../lib/store', async () => {
  const { DEFAULT_PLAN } = await import('../../../lib/defaultPlan')
  const { DEFAULT_CONFIG } = await import('../../../lib/plan')
  return {
    useStore: () => ({ sessions: state.sessions, plan: DEFAULT_PLAN, config: { ...DEFAULT_CONFIG, blockStart: '2026-11-02' } }),
  }
})

vi.mock('../components/Chart', () => ({
  default: (props: { series: Series[] }) => {
    state.charts.push(props)
    return null
  },
}))

const { default: ExerciseProgress } = await import('./ExerciseProgress')

const set = (setIndex: number, weight: number, reps: number, exerciseId = 'leg-press'): SetLog => ({
  exerciseId, setIndex, weight, reps, done: true,
})

let seq = 0
const session = (date: string, sets: SetLog[], routineId = 'espalda-d1'): StrengthSession => ({
  id: `s${++seq}`,
  kind: 'strength',
  routineId,
  date,
  startedAt: Date.parse(date + 'T10:00:00'),
  finishedAt: Date.parse(date + 'T11:00:00'),
  notes: '',
  sets,
})

const render = (sessions: StrengthSession[]) => {
  state.sessions = sessions
  state.charts = []
  return renderToString(<ExerciseProgress routineId="espalda-d1" onBack={() => {}} />).replace(/<!-- -->/g, '')
}

describe('ExerciseProgress', () => {
  // Pinned before the records change: the two charts keep their data.
  it('charts the best set and the exercise volume per session of the routine', () => {
    render([
      session('2026-11-02', [set(0, 80, 8), set(1, 60, 12)]),
      session('2026-11-09', [set(0, 70, 10), set(1, 70, 10)]),
    ])
    expect(state.charts.map(c => c.series)).toEqual([
      [{ key: 'peso', label: 'Mejor serie (kg)', color: 'var(--s1)', points: [{ x: '2026-11-02', y: 80 }, { x: '2026-11-09', y: 70 }] }],
      [{ key: 'vol', label: 'Volumen del ejercicio (kg)', color: 'var(--s2)', points: [{ x: '2026-11-02', y: 1360 }, { x: '2026-11-09', y: 1400 }] }],
    ])
  })

  it('keeps the session-by-session list and the gain since the first session', () => {
    const html = render([
      session('2026-11-02', [set(0, 80, 8)]),
      session('2026-11-09', [set(0, 70, 10)]),
    ])
    expect(html).toContain('<strong>70,0</strong><span>kg × 10</span>')
    expect(html).toContain('<strong>80,0</strong><span>kg × 8</span>')
    expect(html).toContain('Desde el 2 nov')
    expect(html).toContain('-10,0 <span>kg</span>')
  })

  it('shows the all-time best weight, not the latest session', () => {
    const html = render([
      session('2026-11-02', [set(0, 80, 8)]),
      session('2026-11-09', [set(0, 70, 10)]),
    ])
    expect(html).toContain('<div class="label">Mejor peso</div><div class="value num">80,0 <span>kg × 8</span>')
    expect(html).not.toContain('Mejor serie</div>')
  })

  it('shows the best volume of one session', () => {
    const html = render([
      session('2026-11-02', [set(0, 80, 8), set(1, 80, 8), set(2, 80, 8)]), // 1920
      session('2026-11-09', [set(0, 100, 8), set(1, 100, 8), set(2, 100, 8)]), // 2400
      session('2026-11-16', [set(0, 70, 10)]),
    ])
    expect(html).toContain('<div class="label">Mejor volumen</div><div class="value num">2.400 <span>kg</span>')
  })

  it('reads records across every routine for the exercise', () => {
    const html = render([
      session('2026-11-02', [set(0, 80, 8)]),
      session('2026-11-03', [set(0, 90, 5)], 'espalda-d4'),
    ])
    expect(html).toContain('<div class="label">Mejor peso</div><div class="value num">90,0 <span>kg × 5</span>')
  })
})
