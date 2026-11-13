// S8: Perfil renders the selected discipline's metrics only (node, no DOM).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { DisciplineCtx, StoreProvider } from '../../../lib/store'
import { disciplineActions } from '../../../lib/disciplineSelection'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import type { SessionKind } from '../../../lib/types'
import type { StrengthMetrics, SwimMetrics } from '../lib/profileMetrics'
import Profile, { ProfileView } from './Profile'

const text = (html: string) => html.replace(/<!-- -->/g, '')
const noop = () => {}

afterEach(() => vi.unstubAllGlobals())

function renderProfile(active: SessionKind): string {
  const rows = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => void rows.set(k, v),
    removeItem: (k: string) => void rows.delete(k),
  })
  const api = disciplineActions({
    config: { ...DEFAULT_CONFIG, disciplines: ['strength', 'swim'] },
    stored: active,
    setStored: noop,
    saveConfig: async () => {},
  })
  return text(renderToString(
    <StoreProvider>
      <DisciplineCtx.Provider value={api}>
        <Profile onOpenSettings={noop} onOpenTraining={noop} onOpenMeasures={noop} />
      </DisciplineCtx.Provider>
    </StoreProvider>,
  ))
}

const strength: StrengthMetrics = {
  kind: 'strength',
  hasSessions: true,
  streak: { days: 12, best: 30 },
  block: { week: 5, totalWeeks: 12, label: 'Semana 5 de 12', done: 18, target: 25 },
  volume: {
    weeks: [1, 2, 3, 4, 5].map(week => ({ week, volume: 1000 + week * 30, current: week === 5 })),
    deltaVsFirst: 12,
  },
  records: [{ exerciseId: 'leg-press', name: 'Prensa', weight: 80, reps: 8, date: '2026-11-03' }],
  body: {
    hasMeasurement: true,
    anyGoalSet: true,
    items: [{ key: 'weight', label: 'Peso', unit: 'kg', value: 80, delta: -2, deltaGood: 'lower', goal: 76, progress: 33 }],
  },
}

const swim: SwimMetrics = {
  kind: 'swim',
  hasSessions: true,
  streak: { days: 3, best: 9 },
  week: { done: 1, target: 2, distanceM: 1500 },
  last4: {
    weeks: ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'].map((monday, i) => ({ monday, distanceM: 1000 * i, sessions: i, current: i === 3 })),
    distanceM: 6000,
    sessions: 6,
    avgSpeedMPerMin: 50.4,
  },
  bestPaceSecPer100m: 118,
  longest: { distanceM: 2000, date: '2026-11-11' },
  totalDistanceM: 12500,
}

describe('Profile under the selected discipline', () => {
  it('under Gimnasio shows the gym blocks and no swim settings', () => {
    const html = renderProfile('strength')
    expect(html).toContain('Tu progreso en gimnasio')
    expect(html).toContain('Ajustes')
    expect(html).toContain('Récords personales')
    expect(html).toContain('Cuerpo frente a tus metas')
    expect(html).not.toContain('Largo de la piscina')
    expect(html).not.toContain('Mejor ritmo')
  })

  it('under Natación shows the swim blocks and no gym volume', () => {
    const html = renderProfile('swim')
    expect(html).toContain('Tu progreso en natación')
    expect(html).toContain('Mejor ritmo')
    expect(html).not.toContain('Volumen')
    expect(html).not.toContain('Récords personales')
    expect(html).not.toContain('Cuerpo frente a tus metas')
  })

  it('shows one empty state per block with no sessions of the discipline', () => {
    const swimHtml = renderProfile('swim')
    expect(swimHtml).toContain('Todavía no nadaste. Tu progreso aparece aquí después de tu primera sesión.')
    const gymHtml = renderProfile('strength')
    expect(gymHtml).toContain('Todavía no entrenaste. Tu progreso aparece aquí después de tu primera sesión.')
  })
})

describe('ProfileView copy', () => {
  it('renders the Gimnasio figures', () => {
    const html = text(renderToString(<ProfileView metrics={strength} onOpenSettings={noop} onOpenTraining={noop} onOpenMeasures={noop} />))
    expect(html).toContain('Racha')
    expect(html).toContain('12 días · mejor: 30')
    expect(html).toContain('Este bloque')
    expect(html).toContain('Semana 5 de 12')
    expect(html).toContain('Entrenamientos: 18 de 25')
    expect(html).toContain('Volumen por semana')
    expect(html).toContain('+12 % frente a la semana 1')
    expect(html).toContain('Prensa: 80 kg × 8')
    expect(html).toContain('Ver todos')
    expect(html).toContain('Anotar medición')
    expect(html).toContain('meta 76,0 kg')
    expect(html).not.toContain('Define tus metas en Ajustes')
  })

  it('renders the Natación figures', () => {
    const html = text(renderToString(<ProfileView metrics={swim} onOpenSettings={noop} />))
    expect(html).toContain('Esta semana')
    expect(html).toContain('Sesiones: 1 de 2')
    expect(html).toContain('Distancia: 1.500 m')
    expect(html).toContain('Últimas 4 semanas')
    expect(html).toContain('6.000 m · 6 sesiones')
    expect(html).toContain('1:58 /100 m')
    expect(html).toContain('Velocidad media')
    expect(html).toContain('50,4 m/min')
    expect(html).toContain('Sesión más larga')
    expect(html).toContain('2.000 m')
    expect(html).toContain('11 nov')
    expect(html).toContain('Distancia total')
    expect(html).toContain('12.500 m')
  })

  it('asks to set goals when none is set, and has no pace without timed swims', () => {
    const noGoals = text(renderToString(<ProfileView metrics={{ ...strength, body: { ...strength.body, anyGoalSet: false } }} onOpenSettings={noop} />))
    expect(noGoals).toContain('Define tus metas en Ajustes')
    const noPace = text(renderToString(<ProfileView metrics={{ ...swim, bestPaceSecPer100m: null, last4: { ...swim.last4, avgSpeedMPerMin: null } }} onOpenSettings={noop} />))
    expect(noPace).toContain('Mejor ritmo')
    expect(noPace).toContain('Cronometra un bloque para ver tu ritmo.')
  })

  it('without a measurement shows the body empty state', () => {
    const html = text(renderToString(<ProfileView metrics={{ ...strength, body: { hasMeasurement: false, anyGoalSet: true, items: [] } }} onOpenSettings={noop} />))
    expect(html).toContain('Todavía no anotaste mediciones.')
  })
})
