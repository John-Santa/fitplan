import type { RoutineId, Session, SessionByKind, SessionKind, StrengthSession, SwimSession, WeeklyRoutine } from '../types'
import { SESSION_KIND_FOR_DAY, routineById } from './plan'
import { bestSet, doneSets, fmt, mmss, sessionVolume, todayISO } from './calc'

/* ---------- tabla de descriptores de disciplina ---------- */

/** Lo que cada digest de sesion necesita mostrar, sin importar la
 *  disciplina: titulo, lineas de detalle y si hay algo cargado. Agruparlo en
 *  un solo tipo es lo que permite que sessionDigest sea UN switch en vez de
 *  tres (uno por campo). */
export interface SessionDigest {
  title: string
  lines: string[]
  hasEntries: boolean
}

/** Lo que hace falta para crear una sesion nueva de cada disciplina: una
 *  rutina para fuerza, el largo de la piscina para natacion. Condicional
 *  sobre S en vez de un objeto generico: create() para una StrengthSession
 *  concreta exige RoutineId, no "cualquier cosa". */
type CreateSeed<S extends Session> = S extends StrengthSession ? RoutineId : S extends SwimSession ? number : never

/** Descriptor de una disciplina. DISCIPLINES (mas abajo) es la compuerta de
 *  exhaustividad: el mismo mecanismo que KIND_LABELS en plan.ts. Los tres
 *  campos de funcion (create/digest/hasLoggedEntries) no se pueden invocar
 *  via `DISCIPLINES[s.kind].campo(s)` para un `s: Session` sin estrechar —
 *  limitacion conocida de TypeScript con uniones correlacionadas — por eso
 *  sessionDigest existe como un switch manual que llama a la entrada
 *  concreta (DISCIPLINES.strength.digest / DISCIPLINES.swim.digest) dentro
 *  de cada rama, donde `s` ya esta estrechado. */
export interface Discipline<S extends Session> {
  label: string
  startLabel: string
  workLabel: string
  workUnit: string
  entryLabel: string
  betterIsLower: boolean
  defaultRestSec: number
  create: (date: string, seed: CreateSeed<S>) => S
  digest: (s: S) => SessionDigest
  hasLoggedEntries: (s: S) => boolean
}

function strengthCreate(date: string, routineId: RoutineId): StrengthSession {
  return {
    kind: 'strength',
    id: `${routineId}-${Date.now()}`,
    routineId,
    date,
    startedAt: Date.now(),
    finishedAt: null,
    sets: [],
    notes: '',
  }
}

function strengthHasLoggedEntries(s: StrengthSession): boolean {
  return doneSets(s) > 0
}

function strengthDigest(s: StrengthSession): SessionDigest {
  const r = routineById(s.routineId)
  const best = r?.exercises.map(e => ({ e, b: bestSet(s.sets, e.id) })).filter(x => x.b) ?? []
  return {
    title: r?.name ?? s.routineId,
    lines: best.map(x => `${x.e.name}: ${fmt(x.b!.weight)} kg × ${x.b!.reps}`),
    hasEntries: strengthHasLoggedEntries(s),
  }
}

function swimCreate(date: string, poolLengthM: number): SwimSession {
  return {
    kind: 'swim',
    id: `swim-${Date.now()}`,
    date,
    startedAt: Date.now(),
    finishedAt: null,
    poolLengthM,
    blocks: [],
    rpe: null,
    notes: '',
  }
}

function swimHasLoggedEntries(s: SwimSession): boolean {
  return s.blocks.some(b => b.done)
}

/** Metros nadados: solo bloques marcados, igual criterio que doneSets. */
function swimDistance(s: SwimSession): number {
  return s.blocks.reduce((a, b) => a + (b.done ? (b.distanceM ?? 0) : 0), 0)
}

function swimDigest(s: SwimSession): SessionDigest {
  const done = s.blocks.filter(b => b.done)
  return {
    title: 'Natación',
    lines: done.map(b => `Bloque ${b.index + 1}: ${b.distanceM ?? '—'} m${b.timeSec != null ? ` · ${mmss(b.timeSec)}` : ''}`),
    hasEntries: swimHasLoggedEntries(s),
  }
}

export const DISCIPLINES: { [K in SessionKind]: Discipline<SessionByKind[K]> } = {
  strength: {
    label: 'Fuerza',
    startLabel: 'Entrenar',
    workLabel: 'Volumen',
    workUnit: 'kg',
    entryLabel: 'Series',
    betterIsLower: false,
    defaultRestSec: 90,
    create: strengthCreate,
    digest: strengthDigest,
    hasLoggedEntries: strengthHasLoggedEntries,
  },
  swim: {
    label: 'Natación',
    startLabel: 'Nadar',
    workLabel: 'Distancia',
    workUnit: 'm',
    entryLabel: 'Largos',
    betterIsLower: false,
    defaultRestSec: 30,
    create: swimCreate,
    digest: swimDigest,
    hasLoggedEntries: swimHasLoggedEntries,
  },
}

/** DISCIPLINES[s.kind].digest(s) no compila para un `s: Session` generico
 *  (uniones correlacionadas). Este switch es la unica excepcion: cada rama
 *  estrecha `s` antes de llamar a la entrada concreta de DISCIPLINES. Tipo
 *  de retorno explicito y sin `default`: agregar una disciplina rompe esto
 *  en "Function lacks ending return statement" hasta que se le agrega su
 *  rama aca. */
export function sessionDigest(s: Session): SessionDigest {
  switch (s.kind) {
    case 'strength':
      return DISCIPLINES.strength.digest(s)
    case 'swim':
      return DISCIPLINES.swim.digest(s)
  }
}

/** Mismo problema de union correlacionada que sessionDigest, para el valor
 *  numerico de trabajo de una sesion (kg de fuerza, metros de natacion). */
function sessionWorkValue(s: Session): number {
  switch (s.kind) {
    case 'strength':
      return sessionVolume(s)
    case 'swim':
      return swimDistance(s)
  }
}

/* ---------- agregados semanales, por disciplina ---------- */

/** Sesiones de una disciplina, terminadas, con fecha dentro de [start, end]
 *  (limites inclusivos, formato YYYY-MM-DD). El unico filtro por disciplina
 *  de todo el modulo: toda metrica de mas arriba lo usa en vez de repetir el
 *  chequeo `s.kind === kind` a mano. */
export function finishedIn<K extends SessionKind>(
  sessions: Session[],
  kind: K,
  start: string,
  end: string,
): SessionByKind[K][] {
  return sessions.filter(
    (s): s is SessionByKind[K] => s.kind === kind && s.finishedAt != null && s.date >= start && s.date <= end,
  )
}

/** Rango ISO [inicio, fin] de la semana actual (7 dias terminando hoy),
 *  mismo criterio de limites que usa weeklyCount(). */
function currentWeekRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getTime() - 6 * 86400000)
  return { start: todayISO(start), end: todayISO(now) }
}

/** Racha de semanas con al menos 3 sesiones de fuerza terminadas. Antes
 *  vivia en calc.ts y contaba CUALQUIER sesion terminada sin mirar la
 *  disciplina (R1): la primera sesion de natacion inflaba la racha de
 *  fuerza. */
export function weeklyCount(sessions: Session[], weeksBack = 8) {
  const out: { week: string; count: number }[] = []
  const now = new Date()
  for (let i = weeksBack - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 86400000)
    const start = new Date(end.getTime() - 6 * 86400000)
    const a = todayISO(start), b = todayISO(end)
    out.push({ week: b, count: finishedIn(sessions, 'strength', a, b).length })
  }
  return out
}

/** Volumen total (kg) de las sesiones de FUERZA terminadas en la semana
 *  actual. Antes sumaba cualquier sesion terminada (R1): una sesion de
 *  natacion no aporta kg, pero tampoco debe romper la suma. */
export function weeklyVolume(sessions: Session[]): number {
  const { start, end } = currentWeekRange()
  return finishedIn(sessions, 'strength', start, end).reduce((a, s) => a + sessionVolume(s), 0)
}

/** Series completadas en las sesiones de FUERZA terminadas en la semana actual. */
export function weeklySetCount(sessions: Session[]): number {
  const { start, end } = currentWeekRange()
  return finishedIn(sessions, 'strength', start, end).reduce((a, s) => a + doneSets(s), 0)
}

/** Sesiones terminadas dentro del bloque vigente, de CUALQUIER disciplina:
 *  a diferencia de las tres funciones de arriba, esta es un conteo, no una
 *  suma de unidades incompatibles, asi que mezclar disciplinas no la vuelve
 *  incorrecta (ver regla "ningun mosaico mezcla unidades" en Home). */
export function blockSessionCount(sessions: Session[], blockStart: string, blockEnd: string): number {
  return sessions.filter(s => s.finishedAt != null && s.date >= blockStart && s.date <= blockEnd).length
}

/** Dias (0..6) de la semana configurada que registran esa disciplina.
 *  Generaliza a trainingDayCount: dayCountFor(week, 'strength') cuenta lo
 *  mismo que antes, y dayCountFor(week, 'swim') existe ahora sin escribir
 *  una segunda funcion casi identica. */
export function dayCountFor(week: WeeklyRoutine, kind: SessionKind): number {
  return week.reduce((n, d) => (SESSION_KIND_FOR_DAY[d.kind] === kind ? n + 1 : n), 0)
}

/** Una linea de resumen semanal por disciplina, lista para un par de tiles
 *  (conteo de sesiones vs. meta, y valor de trabajo con su unidad). */
export interface WeeklyLine {
  kind: SessionKind
  label: string
  count: number
  target: number
  workLabel: string
  workUnit: string
  workValue: number
}

/** Recorre DISCIPLINES en vez de enumerar 'strength'/'swim' a mano: una
 *  disciplina nueva agregada a DISCIPLINES aparece sola en el resultado, y
 *  por lo tanto sola en Inicio (que itera este arreglo, no las claves). */
export function weeklySummary(sessions: Session[], week: WeeklyRoutine): WeeklyLine[] {
  const { start, end } = currentWeekRange()
  return (Object.keys(DISCIPLINES) as SessionKind[]).map(kind => {
    const finished = sessions.filter(s => s.kind === kind && s.finishedAt != null && s.date >= start && s.date <= end)
    return {
      kind,
      label: DISCIPLINES[kind].label,
      count: finished.length,
      target: dayCountFor(week, kind),
      workLabel: DISCIPLINES[kind].workLabel,
      workUnit: DISCIPLINES[kind].workUnit,
      workValue: finished.reduce((a, s) => a + sessionWorkValue(s), 0),
    }
  })
}

