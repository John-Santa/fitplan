// Hoy for the selected discipline (S5). Home has no DOM test of its own, so
// this smoke render mocks the store and the discipline hook and renders to a
// string (vitest runs in 'node'). Gimnasio's numbers are pinned against the
// pre-switcher formulas (the global habit context) for gym-only data.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Config, Session, SessionKind } from '../../../lib/types'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { DEFAULT_PLAN } from '../../../lib/defaultPlan'
import { dayStatus, streak, votes } from '../../habit/lib/habit'
import { restAllowance, weekSummary } from '../../habit/lib/week'

const state = vi.hoisted(() => ({ sessions: [] as Session[], config: null as unknown as Config, active: 'strength' as SessionKind }))

vi.mock('../../../lib/store', () => ({
  useStore: () => ({
    sessions: state.sessions,
    config: state.config,
    plan: DEFAULT_PLAN,
    saveConfig: async () => {},
    measurements: [],
    mergeMeasurement: async () => {},
  }),
  useDerivedMeasurements: () => [],
}))
vi.mock('../../../lib/useDiscipline', () => ({
  useDiscipline: () => ({ active: state.active, list: ['strength', 'swim'], select: () => {}, add: async () => {}, hide: async () => {} }),
}))
vi.mock('../components/BackupNotice', () => ({ default: () => null }))

const { default: Home } = await import('./Home')

// 2026-11-11 is a Wednesday: Mon 09, Tue 10.
const MON = '2026-11-09'
const TUE = '2026-11-10'
const WED = '2026-11-11'
const ROUTINE = DEFAULT_PLAN.routines[0].id

let n = 0
const gym = (date: string): Session => ({ id: `g${n++}`, kind: 'strength', routineId: ROUTINE, date, startedAt: 1, finishedAt: 2, notes: '', sets: [] })
const swim = (date: string, distanceM = 1500, timeSec: number | null = 1875): Session => ({
  id: `w${n++}`, kind: 'swim', date, startedAt: 1, finishedAt: 2, notes: '', poolLengthM: 25, rpe: null,
  blocks: [{ index: 0, distanceM, timeSec, stroke: 'freestyle', done: true }],
})

const render = (props: { onStartSwim?: () => void } = {}) =>
  renderToString(<Home go={() => {}} startRoutine={() => {}} {...props} />).replace(/<!-- -->/g, '')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 11, 12))
  state.config = { ...DEFAULT_CONFIG, blockStart: '2026-11-02', blockEnd: '2027-01-24', swimWeeklyTarget: 2, habitCheckIns: [] }
})
afterEach(() => vi.useRealTimers())

describe('Home under Gimnasio', () => {
  it('shows the numbers the global habit context gave before, for gym-only data', () => {
    state.active = 'strength'
    state.sessions = [gym(MON), gym(TUE)]
    const old = { sessions: state.sessions, config: state.config, today: WED, restAllowance: restAllowance(DEFAULT_PLAN) }
    const days = streak(old).days
    const summary = weekSummary(DEFAULT_PLAN, state.sessions, state.config.habitCheckIns, WED)

    const html = render()
    expect(days).toBe(2)
    expect(html).toContain(`${days} días`)
    expect(html).toContain(`${votes(old)} entrenamientos`)
    expect(html).toContain(`Esta semana · ${summary.done} de ${summary.target} entrenamientos`)
    expect(html).toContain(`Comodines de descanso: ${summary.restAllowance - summary.restUsed} de ${summary.restAllowance} disponibles`)
    expect(dayStatus(TUE, old)).toBe('kept')
    // Today's Hoy, untouched.
    expect(html).toContain('Rutinas de la semana')
    expect(html).toContain('Marcar caminata hecha')
    expect(html).toContain('Anotar peso')
    expect(html).toContain('Empezar entrenamiento')
    expect(html).not.toContain('Nadar')
  })

  it('does not count a swim for the Gimnasio streak, votes or week', () => {
    state.active = 'strength'
    state.sessions = [gym(MON), swim(TUE)]
    const html = render()
    // The swim-only Tuesday spends a wildcard (a rest day keeps the streak) but is no vote.
    expect(html).toContain('2 días')
    expect(html).toContain('1 entrenamiento')
    expect(html).not.toContain('2 entrenamientos')
    expect(html).toContain(`Esta semana · 1 de ${DEFAULT_PLAN.routines.length} entrenamientos`)
    expect(html).toContain('Marcar caminata hecha')
  })

  it('still offers the walk when only a swim was done today', () => {
    state.active = 'strength'
    state.sessions = [swim(WED)]
    expect(render()).toContain('Marcar caminata hecha')
  })
})

describe('Home under Natación', () => {
  it('renders the swim hero, week, distance and last session with the swim streak and votes', () => {
    state.active = 'swim'
    state.sessions = [gym(MON), swim(TUE)]
    const html = render({ onStartSwim: () => {} })
    expect(html).toContain('Nadar')
    expect(html).toContain('Piscina de 25 m')
    expect(html).toContain('Esta semana: 1 de 2')
    expect(html).toContain('Última sesión: 1.500 m · 2:05 /100 m')
    expect(html).toContain('1 sesión de natación')
    expect(html).toContain('1 día')
    expect(html).not.toContain('entrenamientos')
  })

  it('plural votes copy and no gym blocks', () => {
    state.active = 'swim'
    state.sessions = [swim(MON), swim(TUE)]
    const html = render()
    expect(html).toContain('2 sesiones de natación')
    expect(html).not.toContain('Rutinas de la semana')
    expect(html).not.toContain('Marcar caminata hecha')
    expect(html).not.toContain('Anotar peso')
    expect(html).not.toContain('Empezar entrenamiento')
    expect(html).not.toContain('Volumen')
  })

  it('hides the block-end card and says the week is met', () => {
    state.active = 'swim'
    state.config = { ...state.config, blockStart: '2026-01-05', blockEnd: '2026-03-29' }
    state.sessions = [swim(MON), swim(TUE)]
    const html = render()
    expect(html).toContain('Semana cumplida. Puedes nadar igual.')
    expect(html).not.toContain('Terminaste el bloque')
  })
})
