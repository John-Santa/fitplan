// Regresiones de la persistencia del plan editable (S4, S5): lectura de
// sesiones anteriores, migracion de la config, plan guardado y respaldos.
// Todo es logica pura; el pegamento con IndexedDB esta en
// persistence.idb.test.ts. Los fixtures de la config anterior van en linea
// (valores del commit 4d0c2c0): el test no lee git ni otros checkouts.
import { describe, expect, it } from 'vitest'
import type { Config, WeeklyRoutine } from './types'
import { checkBackupVersion } from './db'
import { DEFAULT_PLAN, defaultPlanWithLegacy } from './defaultPlan'
import { migrateLegacyConfig, NEW_BLOCK_END, NEW_BLOCK_START, OLD_BLOCK_START } from './legacyConfig'
import { planMigration } from './migration'
import { DEFAULT_CONFIG, DEFAULT_WEEKLY_ROUTINE, mergeConfig, normalizeSession, PLAN_WEEKLY_ROUTINE } from './plan'
import { normalizePlan, planFromBackup } from './planStorage'

const GYM_NOTE = '20:30 en el gimnasio'
const SWIM_NOTE =
  '20:00 a 21:00. Cierra el segundo trabajo a las 19:30 y come la fruta o el batido antes de salir. En casa a las 22:30, cena lista para calentar y a dormir a las 23:30.'

/** DEFAULT_CONFIG tal como la traia la app en 4d0c2c0, antes del plan editable
 *  (y antes de routineExercises, que llego con el PR #1). */
const OLD_SHIPPED_CONFIG: Omit<Config, 'routineExercises' | 'habitCheckIns' | 'intentions' | 'disciplines' | 'swimWeeklyTarget'> = {
  heightCm: 173,
  blockStart: '2026-08-04',
  blockEnd: '2026-09-28',
  goal: { weight: 76.5, fatPct: 22.2, fatMass: 17.0, muscle: 32.2, water: 43.6, waist: 96.5, hip: 97.5, chest: 102.5, neck: 40.5 },
  weeklyRoutine: [
    { kind: 'rest', title: '', note: 'Estiramiento y caminata liviana. Dedica dos horas a cocinar las cinco cenas de la semana: con cena a las 22:15, esta es la tarea más importante del domingo.' },
    { kind: 'training', routineId: 'dia1', title: '', note: GYM_NOTE },
    { kind: 'swim', title: '', note: SWIM_NOTE },
    { kind: 'training', routineId: 'dia2', title: '', note: GYM_NOTE },
    { kind: 'swim', title: '', note: SWIM_NOTE },
    { kind: 'training', routineId: 'dia3', title: '', note: GYM_NOTE },
    { kind: 'walk', title: '', note: '60 a 75 minutos a la hora que quieras. Dormir 8 h 45.' },
  ],
  poolLengthM: 25,
}

/** La misma config tal como la deja mergeConfig hoy: routineExercises vacio y
 *  los campos de habitos (habitCheckIns, intentions) y de disciplinas
 *  (disciplines, swimWeeklyTarget) en su valor por defecto. */
const oldConfig = (): Config => ({
  ...structuredClone(OLD_SHIPPED_CONFIG),
  routineExercises: {},
  habitCheckIns: [],
  intentions: structuredClone(DEFAULT_CONFIG.intentions),
  disciplines: ['strength'],
  swimWeeklyTarget: 2,
})

const legacySet = { exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: true }
const legacy = { id: 's1', kind: 'strength', routineId: 'dia1', date: '2026-09-01', startedAt: 1, finishedAt: 2, sets: [legacySet], notes: 'x' }

describe('el fixture de la config anterior', () => {
  it('coincide con la semana legada que conserva plan.ts y no cambia al pasar por mergeConfig', () => {
    expect(OLD_SHIPPED_CONFIG.weeklyRoutine).toEqual(DEFAULT_WEEKLY_ROUTINE)
    expect(mergeConfig(oldConfig())).toEqual(oldConfig())
  })
})

describe('normalizeSession con sesiones anteriores', () => {
  it('una sesion de fuerza v2 sale con la misma forma que antes', () => {
    expect(normalizeSession(legacy)).toEqual({
      kind: 'strength', id: 's1', routineId: 'dia1', date: '2026-09-01', startedAt: 1, finishedAt: 2,
      sets: [legacySet], notes: 'x',
    })
  })

  it('sin kind se lee como fuerza, descarta la serie invalida y rellena notes', () => {
    const raw = { id: 's0', routineId: 'dia2', date: '2026-09-01', startedAt: 1, finishedAt: null, sets: [legacySet, { bad: 1 }] }
    expect(normalizeSession(raw)).toEqual({
      kind: 'strength', id: 's0', routineId: 'dia2', date: '2026-09-01', startedAt: 1, finishedAt: null,
      sets: [legacySet], notes: '',
    })
  })

  it('una sesion de natacion sale igual', () => {
    const swim = {
      id: 'w1', kind: 'swim', date: '2026-09-02', startedAt: 3, finishedAt: 4, notes: '', poolLengthM: 25, rpe: 5,
      blocks: [{ index: 0, distanceM: 100, timeSec: 120, stroke: 'freestyle', done: true }],
    }
    expect(normalizeSession(swim)).toEqual({
      kind: 'swim', id: 'w1', date: '2026-09-02', startedAt: 3, finishedAt: 4, poolLengthM: 25,
      blocks: swim.blocks, rpe: 5, notes: '',
    })
  })

  it('conserva las sesiones de rutinas desconocidas o archivadas', () => {
    for (const routineId of ['espalda-d3', 'rutina-borrada']) {
      expect(normalizeSession({ ...legacy, routineId })).toMatchObject({ routineId, sets: [legacySet] })
    }
  })

  it('descarta la sesion cuando el routineId no es un texto no vacio', () => {
    for (const routineId of ['', 5, null, undefined, {}]) {
      expect(normalizeSession({ ...legacy, routineId })).toBeNull()
    }
  })
})

describe('migrateLegacyConfig', () => {
  const week = DEFAULT_PLAN.weekTemplate

  it('semana anterior y bloque anterior: reemplaza ambos y conserva el resto', () => {
    const next = migrateLegacyConfig(oldConfig(), week)
    expect(next).toEqual({ ...oldConfig(), weeklyRoutine: week, blockStart: NEW_BLOCK_START, blockEnd: NEW_BLOCK_END })
    expect([NEW_BLOCK_START, NEW_BLOCK_END]).toEqual(['2026-11-16', '2027-02-07'])
  })

  it('usa la semana que recibe, no la de fabrica', () => {
    const custom = PLAN_WEEKLY_ROUTINE.map(d => ({ ...d, note: 'otra' })) as unknown as WeeklyRoutine
    expect(migrateLegacyConfig(oldConfig(), custom)?.weeklyRoutine).toEqual(custom)
  })

  it('solo la semana anterior: cambia la semana y respeta las fechas editadas', () => {
    const next = migrateLegacyConfig({ ...oldConfig(), blockStart: '2026-10-01', blockEnd: '2026-12-01' }, week)
    expect(next?.weeklyRoutine).toEqual(week)
    expect(next).toMatchObject({ blockStart: '2026-10-01', blockEnd: '2026-12-01' })
  })

  it('solo el bloque anterior: cambia las fechas y respeta la semana editada', () => {
    const edited = oldConfig().weeklyRoutine.map(d =>
      d.kind === 'training' ? { kind: 'swim' as const, title: '', note: '' } : d,
    ) as unknown as WeeklyRoutine
    const next = migrateLegacyConfig({ ...oldConfig(), weeklyRoutine: edited }, week)
    expect(next?.weeklyRoutine).toEqual(edited)
    expect(next).toMatchObject({ blockStart: NEW_BLOCK_START, blockEnd: NEW_BLOCK_END })
  })

  it('una config ya actual devuelve null', () => {
    expect(migrateLegacyConfig(DEFAULT_CONFIG, week)).toBeNull()
  })

  it('con fechas distintas del bloque anterior, aunque la semana sea del plan, devuelve null', () => {
    const cfg = { ...oldConfig(), blockStart: '2026-12-01', weeklyRoutine: week }
    expect(migrateLegacyConfig(cfg, week)).toBeNull()
  })

  it('no muta la config recibida y es idempotente', () => {
    const cfg = oldConfig()
    const next = migrateLegacyConfig(cfg, week)!
    expect(cfg).toEqual(oldConfig())
    expect(migrateLegacyConfig(next, week)).toBeNull()
  })
})

describe('planMigration con la config real que traia la app', () => {
  const merged = mergeConfig(oldConfig())

  it('escribe el plan con las rutinas archivadas y reescribe semana y fechas', () => {
    const r = planMigration(undefined, merged)
    expect(r.plan).toEqual(defaultPlanWithLegacy())
    expect(r.config).toEqual(migrateLegacyConfig(merged, DEFAULT_PLAN.weekTemplate))
    expect(r.config).toMatchObject({
      weeklyRoutine: DEFAULT_PLAN.weekTemplate, blockStart: '2026-11-16', blockEnd: '2027-02-07',
      goal: OLD_SHIPPED_CONFIG.goal, heightCm: 173, poolLengthM: 25,
    })
  })

  it('es idempotente en cada punto de fallo posible', () => {
    const first = planMigration(undefined, merged)
    // Plan y config escritos: nada que hacer.
    expect(planMigration(first.plan, first.config!)).toEqual({ plan: null, config: null })
    // Plan escrito pero config vieja: con plan guardado no se vuelve a decidir.
    expect(planMigration(first.plan, merged)).toEqual({ plan: null, config: null })
    // Config escrita pero plan no: solo falta el plan.
    const again = planMigration(undefined, first.config!)
    expect(again.config).toBeNull()
    expect(again.plan).not.toBeNull()
  })

  it('semana personalizada y otras fechas: solo el plan, config intacta', () => {
    const cfg: Config = { ...oldConfig(), blockStart: '2026-10-01', blockEnd: '2026-12-01', weeklyRoutine: [...PLAN_WEEKLY_ROUTINE] as WeeklyRoutine }
    const snapshot = structuredClone(cfg)
    const r = planMigration(undefined, cfg)
    expect(r.plan).not.toBeNull()
    expect(r.config).toBeNull()
    expect(cfg).toEqual(snapshot)
  })

  it('un plan guardado, legible o no, nunca se vuelve a escribir', () => {
    for (const stored of [DEFAULT_PLAN, 'basura', null, 0, {}]) {
      expect(planMigration(stored, oldConfig())).toEqual({ plan: null, config: null })
    }
  })

  it('OLD_BLOCK_START sigue exportado desde migration.ts', () => {
    expect(OLD_BLOCK_START).toBe('2026-08-04')
  })
})

describe('normalizePlan', () => {
  it('el plan por defecto y el plan con rutinas archivadas dan el mismo plan, tambien por JSON', () => {
    expect(normalizePlan(DEFAULT_PLAN)).toEqual(DEFAULT_PLAN)
    expect(normalizePlan(defaultPlanWithLegacy())).toEqual(defaultPlanWithLegacy())
    expect(normalizePlan(JSON.parse(JSON.stringify(defaultPlanWithLegacy())))).toEqual(defaultPlanWithLegacy())
  })

  it('lo ilegible da null y customExercises ausente da []', () => {
    const bad = [undefined, null, 'x', {}, { ...DEFAULT_PLAN, schemaVersion: 2 }, { ...DEFAULT_PLAN, routines: [{}] }]
    for (const raw of bad) expect(normalizePlan(raw)).toBeNull()
    const { customExercises: _omitted, ...rest } = DEFAULT_PLAN
    expect(normalizePlan(rest)?.customExercises).toEqual([])
  })

  it('un ejercicio propio con todos los campos opcionales sobrevive', () => {
    const exercise = {
      id: 'c1', name: 'Mi ejercicio', category: 'strength', equipment: 'x', primaryMuscles: ['a'], secondaryMuscles: [],
      steps: [], cues: [], musclewiki: { slug: 'abc', id: null }, alternativeId: 'leg-press', alternativeText: 't', custom: true,
    }
    const plan = { ...DEFAULT_PLAN, customExercises: [exercise] }
    expect(normalizePlan(plan)).toEqual(plan)
  })
})

describe('respaldos', () => {
  it('checkBackupVersion acepta 1, 2 y 3 y rechaza el resto', () => {
    for (const v of [1, 2, 3]) expect(() => checkBackupVersion(v)).not.toThrow()
    for (const v of [4, 2.5, '2', 0, -1, null, undefined, NaN]) expect(() => checkBackupVersion(v)).toThrow()
    expect(() => checkBackupVersion(4)).toThrow('versión más nueva')
    expect(() => checkBackupVersion('2')).toThrow('no es un respaldo de MagniFit')
  })

  it('planFromBackup: v2 sin plan da null, v3 con plan lo devuelve y un plan roto da null', () => {
    const v2 = { app: 'fitplan', version: 2, exportedAt: '', sessions: [], measurements: [], exerciseMeta: [], config: null }
    expect(planFromBackup(v2)).toBeNull()
    const plan = defaultPlanWithLegacy()
    plan.routines[0].name = 'Editado'
    expect(planFromBackup({ ...v2, version: 3, plan: JSON.parse(JSON.stringify(plan)) })).toEqual(plan)
    expect(planFromBackup({ ...v2, version: 3, plan: { ...plan, warmup: 7 } })).toBeNull()
  })
})
