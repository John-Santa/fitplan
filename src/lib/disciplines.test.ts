// Pruebas de disciplines.ts sobre arreglos de sesiones con tipos MIXTOS
// (fuerza + natacion). R1 es el riesgo mas importante de todo este cambio:
// una metrica documentada como "de fuerza" que en realidad filtra solo por
// fecha infla el conteo semanal con sesiones de otra disciplina y felicita
// al usuario por un objetivo que no cumplio. Estas pruebas fallarian en
// rojo contra la version vieja de weeklyVolume/weeklyCount en calc.ts.
import { describe, expect, it } from 'vitest'
import type { Session, StrengthSession, SwimSession, WeeklyRoutine } from '../types'
import { todayISO } from './calc'
import { DEFAULT_WEEKLY_ROUTINE } from './plan'
import {
  blockSessionCount,
  dayCountFor,
  DISCIPLINES,
  finishedIn,
  finishSwimSession,
  lapsToMetres,
  metresToLaps,
  sessionDigest,
  swimDistance,
  swimHasEnteredData,
  swimPaceSecPer100m,
  swimSessionPaceSecPer100m,
  swimSessionSpeedMPerMin,
  weeklyCount,
  weeklySetCount,
  weeklySummary,
  weeklyVolume,
} from './disciplines'

function strengthSession(overrides: Partial<StrengthSession> = {}): StrengthSession {
  return {
    kind: 'strength',
    id: 'dia1-1',
    routineId: 'dia1',
    date: todayISO(),
    startedAt: Date.now(),
    finishedAt: Date.now(),
    sets: [
      { exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 12, done: true },
      { exerciseId: 'leg-press', setIndex: 1, weight: 80, reps: 10, done: true },
    ],
    notes: '',
    ...overrides,
  }
}

function swimSession(overrides: Partial<SwimSession> = {}): SwimSession {
  return {
    kind: 'swim',
    id: 'swim-1',
    date: todayISO(),
    startedAt: Date.now(),
    finishedAt: Date.now(),
    poolLengthM: 25,
    blocks: [{ index: 0, distanceM: 400, timeSec: 480, stroke: 'freestyle', done: true }],
    rpe: 6,
    notes: '',
    ...overrides,
  }
}

describe('metricas de fuerza sobre un arreglo mixto (R1)', () => {
  it('weeklyVolume devuelve exactamente el volumen de fuerza: ni suma con natacion, ni NaN', () => {
    const mixed: Session[] = [strengthSession(), swimSession()]
    // 80*12 + 80*10 = 1760. Contra la version vieja (sin filtrar por kind),
    // la sesion de natacion no aporta kg pero tampoco debe romper la suma.
    expect(weeklyVolume(mixed)).toBe(1760)
    expect(Number.isNaN(weeklyVolume(mixed))).toBe(false)
  })

  it('una sesion de natacion no infla el conteo semanal de sesiones de fuerza', () => {
    const mixed: Session[] = [strengthSession(), swimSession(), swimSession({ id: 'swim-2' })]
    const weeks = weeklyCount(mixed, 1)
    expect(weeks[weeks.length - 1].count).toBe(1)
  })

  it('weeklySetCount solo cuenta series de sesiones de fuerza', () => {
    const mixed: Session[] = [strengthSession(), swimSession()]
    expect(weeklySetCount(mixed)).toBe(2)
  })

  it('blockSessionCount cuenta cualquier disciplina: es un conteo, no una suma de unidades', () => {
    const mixed: Session[] = [strengthSession(), swimSession()]
    expect(blockSessionCount(mixed, todayISO(), todayISO())).toBe(2)
  })
})

describe('finishedIn', () => {
  it('filtra por disciplina, ventana de fechas y finishedAt', () => {
    const mixed: Session[] = [
      strengthSession(),
      swimSession(),
      strengthSession({ id: 'dia1-2', finishedAt: null }),
    ]
    const result = finishedIn(mixed, 'strength', todayISO(), todayISO())
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('strength')
    expect(result[0].id).toBe('dia1-1')
  })
})

describe('dayCountFor', () => {
  it('cuenta los dias de fuerza y de natacion de la semana por defecto (martes y jueves nadan)', () => {
    expect(dayCountFor(DEFAULT_WEEKLY_ROUTINE, 'strength')).toBe(3)
    expect(dayCountFor(DEFAULT_WEEKLY_ROUTINE, 'swim')).toBe(2)
  })

  it('una semana sin ninguna disciplina asignada devuelve 0 para ambas', () => {
    const restWeek: WeeklyRoutine = [
      { kind: 'rest', title: '', note: '' },
      { kind: 'rest', title: '', note: '' },
      { kind: 'rest', title: '', note: '' },
      { kind: 'rest', title: '', note: '' },
      { kind: 'rest', title: '', note: '' },
      { kind: 'rest', title: '', note: '' },
      { kind: 'rest', title: '', note: '' },
    ]
    expect(dayCountFor(restWeek, 'strength')).toBe(0)
    expect(dayCountFor(restWeek, 'swim')).toBe(0)
  })
})

describe('weeklySummary', () => {
  it('devuelve una linea por disciplina, cada una con su propia unidad de trabajo', () => {
    const mixed: Session[] = [strengthSession(), swimSession()]
    const lines = weeklySummary(mixed, DEFAULT_WEEKLY_ROUTINE)
    const strengthLine = lines.find(l => l.kind === 'strength')!
    const swimLine = lines.find(l => l.kind === 'swim')!

    expect(strengthLine.workUnit).toBe('kg')
    expect(strengthLine.workValue).toBe(1760)
    expect(strengthLine.count).toBe(1)
    expect(strengthLine.target).toBe(3)

    expect(swimLine.workUnit).toBe('m')
    expect(swimLine.workValue).toBe(400)
    expect(swimLine.count).toBe(1)
    expect(swimLine.target).toBe(2)
  })

  it('una semana sin ninguna sesion terminada devuelve conteos y valores en cero, sin romper', () => {
    const lines = weeklySummary([], DEFAULT_WEEKLY_ROUTINE)
    expect(lines).toHaveLength(2)
    for (const l of lines) {
      expect(l.count).toBe(0)
      expect(l.workValue).toBe(0)
    }
  })

  it('una semana sin dias de entreno programados no rompe target (queda en 0)', () => {
    const noTrainingWeek: WeeklyRoutine = [
      { kind: 'walk', title: '', note: '' },
      { kind: 'walk', title: '', note: '' },
      { kind: 'walk', title: '', note: '' },
      { kind: 'walk', title: '', note: '' },
      { kind: 'walk', title: '', note: '' },
      { kind: 'walk', title: '', note: '' },
      { kind: 'walk', title: '', note: '' },
    ]
    const lines = weeklySummary([], noTrainingWeek)
    for (const l of lines) expect(l.target).toBe(0)
  })
})

describe('sessionDigest', () => {
  it('arma un digest de fuerza con el nombre de la rutina y una linea por ejercicio con datos', () => {
    const digest = sessionDigest(strengthSession())
    expect(digest.title).toBe('Día 1 — Pierna')
    expect(digest.hasEntries).toBe(true)
    expect(digest.lines).toEqual(['Prensa de piernas 45°: 80,0 kg × 12'])
  })

  it('arma un digest de natacion con una linea por bloque marcado', () => {
    const digest = sessionDigest(swimSession())
    expect(digest.title).toBe('Natación')
    expect(digest.hasEntries).toBe(true)
    expect(digest.lines).toEqual(['Bloque 1: 400 m · 8:00'])
  })
})

describe('DISCIPLINES', () => {
  it('DISCIPLINES.strength.create(date, routineId) crea una StrengthSession vacia', () => {
    const s = DISCIPLINES.strength.create(todayISO(), 'dia2')
    expect(s.kind).toBe('strength')
    expect(s.routineId).toBe('dia2')
    expect(s.sets).toEqual([])
    expect(s.finishedAt).toBeNull()
  })

  it('DISCIPLINES.swim.create(date, poolLengthM) crea una SwimSession vacia', () => {
    const s = DISCIPLINES.swim.create(todayISO(), 25)
    expect(s.kind).toBe('swim')
    expect(s.poolLengthM).toBe(25)
    expect(s.blocks).toEqual([])
    expect(s.finishedAt).toBeNull()
  })
})

describe('lapsToMetres / metresToLaps (F1-5)', () => {
  it('convierte largos a metros con una piscina de 25 m', () => {
    expect(lapsToMetres(16, 25)).toBe(400)
  })

  it('convierte largos a metros con una piscina que NO es de 25 m', () => {
    // Piscina de 33.3 m (una comun en piletas semiolimpicas): el punto de
    // guardar metros y no largos es exactamente que esta cuenta no dependa
    // de asumir 25 en ningun lado.
    expect(lapsToMetres(12, 33.3)).toBeCloseTo(399.6, 6)
  })

  it('metresToLaps es la inversa de lapsToMetres para la MISMA piscina', () => {
    const poolLengthM = 33.3
    const laps = 12
    expect(metresToLaps(lapsToMetres(laps, poolLengthM), poolLengthM)).toBeCloseTo(laps, 6)
  })

  it('metresToLaps devuelve null si no hay distancia cargada', () => {
    expect(metresToLaps(null, 25)).toBeNull()
  })
})

describe('swimPaceSecPer100m — ritmo derivado (F1-5)', () => {
  it('calcula segundos cada 100 m para un bloque cronometrado', () => {
    // 400 m en 480 s = 120 s cada 100 m.
    expect(swimPaceSecPer100m({ distanceM: 400, timeSec: 480 })).toBe(120)
  })

  it('devuelve null para un bloque sin cronometrar (timeSec null)', () => {
    expect(swimPaceSecPer100m({ distanceM: 400, timeSec: null })).toBeNull()
  })

  it('devuelve null para un bloque sin distancia cargada (distanceM null)', () => {
    expect(swimPaceSecPer100m({ distanceM: null, timeSec: 480 })).toBeNull()
  })

  it('devuelve null en vez de Infinity/NaN si la distancia es 0', () => {
    expect(swimPaceSecPer100m({ distanceM: 0, timeSec: 30 })).toBeNull()
  })
})

describe('finishSwimSession — ronda completa de R7', () => {
  it('persiste un bloque con distancia y tiempo cargados aunque no este marcado como hecho', () => {
    // Reproduce R7 al reves: alguien tipea largos y tiempo pero nunca toca
    // la casilla. El fin de fuerza (Train.tsx) descartaria este bloque con
    // `.filter(s => s.done)`; el de natacion no debe hacerlo.
    const session: SwimSession = {
      kind: 'swim',
      id: 'swim-r7',
      date: todayISO(),
      startedAt: Date.now() - 600000,
      finishedAt: null,
      poolLengthM: 25,
      blocks: [
        { index: 0, distanceM: 400, timeSec: 480, stroke: 'freestyle', done: false },
        { index: 1, distanceM: null, timeSec: null, stroke: 'mixed', done: false },
      ],
      rpe: null,
      notes: '',
    }
    const now = Date.now()
    const finished = finishSwimSession(session, now)
    expect(finished.finishedAt).toBe(now)
    // El bloque cargado sin marcar sigue teniendo sus valores intactos.
    expect(finished.blocks[0]).toEqual({ index: 0, distanceM: 400, timeSec: 480, stroke: 'freestyle', done: false })
    // El bloque vacio tambien sobrevive tal cual (ni se agrega ni se quita nada).
    expect(finished.blocks).toHaveLength(2)
  })

  it('swimHasEnteredData se habilita con datos cargados, sin mirar la marca de hecho', () => {
    const withData: SwimSession = {
      kind: 'swim', id: 's1', date: todayISO(), startedAt: Date.now(), finishedAt: null,
      poolLengthM: 25, blocks: [{ index: 0, distanceM: 400, timeSec: null, stroke: 'freestyle', done: false }],
      rpe: null, notes: '',
    }
    const empty: SwimSession = { ...withData, blocks: [{ index: 0, distanceM: null, timeSec: null, stroke: 'freestyle', done: false }] }
    expect(swimHasEnteredData(withData)).toBe(true)
    expect(swimHasEnteredData(empty)).toBe(false)
  })

  it('swimDistance solo suma bloques marcados (mismo criterio que doneSets)', () => {
    const s: SwimSession = {
      kind: 'swim', id: 's2', date: todayISO(), startedAt: Date.now(), finishedAt: Date.now(),
      poolLengthM: 25,
      blocks: [
        { index: 0, distanceM: 400, timeSec: 480, stroke: 'freestyle', done: true },
        { index: 1, distanceM: 200, timeSec: null, stroke: 'mixed', done: false },
      ],
      rpe: null, notes: '',
    }
    expect(swimDistance(s)).toBe(400)
  })
})

describe('swimSessionPaceSecPer100m / swimSessionSpeedMPerMin — derivacion de sesion completa (F1-6)', () => {
  it('agrega distancia y tiempo solo de los bloques con AMBOS campos cargados; uno sin cronometrar no participa', () => {
    const s = swimSession({
      blocks: [
        { index: 0, distanceM: 400, timeSec: 480, stroke: 'freestyle', done: true },
        // Bloque sin cronometrar: swimDistance lo cuenta, el ritmo de sesion no.
        { index: 1, distanceM: 200, timeSec: null, stroke: 'freestyle', done: true },
      ],
    })
    // 480 s / 400 m * 100 = 120 s/100m; velocidad = 6000/120 = 50 m/min.
    expect(swimSessionPaceSecPer100m(s)).toBe(120)
    expect(swimSessionSpeedMPerMin(s)).toBeCloseTo(50, 6)
  })

  it('devuelve null, nunca NaN/Infinity, cuando ningun bloque quedo cronometrado', () => {
    const s = swimSession({
      blocks: [
        { index: 0, distanceM: 400, timeSec: null, stroke: 'freestyle', done: true },
        { index: 1, distanceM: null, timeSec: null, stroke: 'freestyle', done: false },
      ],
    })
    expect(swimSessionPaceSecPer100m(s)).toBeNull()
    expect(swimSessionSpeedMPerMin(s)).toBeNull()
  })

  it('nunca devuelve Infinity si el tiempo total termina en cero con distancia cargada', () => {
    const s = swimSession({ blocks: [{ index: 0, distanceM: 400, timeSec: 0, stroke: 'freestyle', done: true }] })
    expect(swimSessionSpeedMPerMin(s)).toBeNull()
  })

  it('es independiente del largo de la piscina: opera sobre distanceM (metros), nunca sobre largos', () => {
    // Piscina de 33.3 m, un largo: el resultado no debe depender de asumir 25 en ningun lado.
    const s = swimSession({ poolLengthM: 33.3, blocks: [{ index: 0, distanceM: 33.3, timeSec: 30, stroke: 'freestyle', done: true }] })
    expect(swimSessionPaceSecPer100m(s)).toBeCloseTo(90.09009009, 5)
  })
})
