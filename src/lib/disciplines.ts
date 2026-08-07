import type { RoutineId, Session, SessionByKind, SessionKind, StrengthSession, SwimBlock, SwimSession, SwimStroke, WeeklyRoutine } from '../types'
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

/** Metros nadados: solo bloques marcados, igual criterio que doneSets.
 *  Exportada (F1-5): Train.tsx la usa para la linea de historial y el
 *  detalle de una SwimSession, el mismo rol que sessionVolume cumple para
 *  fuerza. */
export function swimDistance(s: SwimSession): number {
  return s.blocks.reduce((a, b) => a + (b.done ? (b.distanceM ?? 0) : 0), 0)
}

/** Etiqueta en espanol de cada estilo, y el orden en que se ofrecen en el
 *  selector de SwimBody. Record<SwimStroke, string> es la misma compuerta de
 *  exhaustividad que KIND_LABELS en plan.ts: agregar un SwimStroke rompe la
 *  compilacion aca hasta que se le da nombre. */
export const SWIM_STROKE_LABELS: Record<SwimStroke, string> = {
  freestyle: 'Crol',
  backstroke: 'Espalda',
  breaststroke: 'Pecho',
  butterfly: 'Mariposa',
  mixed: 'Mixto',
}

export const SWIM_STROKES = Object.keys(SWIM_STROKE_LABELS) as SwimStroke[]

/** Metros a partir de largos tipeados por el usuario: distanceM = laps *
 *  poolLengthM. Nunca se guarda el numero de largos en si — cambiar el
 *  largo de la piscina no debe reescribir el historial, la misma regla que
 *  guardar el peso en vez del numero de placa (ver A5 en el plan). */
export function lapsToMetres(laps: number, poolLengthM: number): number {
  return laps * poolLengthM
}

/** Inversa de lapsToMetres, para mostrar de vuelta en el input el numero de
 *  largos que corresponde a los metros guardados (con el mismo poolLengthM
 *  con el que se multiplico). null si no hay distancia cargada. */
export function metresToLaps(distanceM: number | null, poolLengthM: number): number | null {
  return distanceM == null ? null : distanceM / poolLengthM
}

/** Ritmo de un bloque en segundos cada 100 m, o null si falta tiempo o
 *  distancia (bloque sin cronometrar) o la distancia es 0 — nunca se
 *  guarda, siempre se deriva (ver mmss en calc.ts para el formato mm:ss al
 *  mostrarlo). */
export function swimPaceSecPer100m(b: Pick<SwimBlock, 'distanceM' | 'timeSec'>): number | null {
  if (b.distanceM == null || b.timeSec == null || b.distanceM <= 0) return null
  return (b.timeSec / b.distanceM) * 100
}

/** Condicion para habilitar "Terminar" en la pantalla de natacion: alguna
 *  distancia o tiempo cargado, SIN mirar la marca de "hecho" (a diferencia
 *  de hasLoggedEntries, que si la mira, para el digest de "cuanto se
 *  hizo"). Exigir la marca aca reproduciria R7: quien tipea distancia y
 *  tiempo pero no toca la casilla no podria ni siquiera intentar guardar la
 *  sesion. */
export function swimHasEnteredData(s: SwimSession): boolean {
  return s.blocks.some(b => b.distanceM != null || b.timeSec != null)
}

/** Ritmo medio de una sesion completa, en segundos cada 100 m (F1-6).
 *  Agrega distancia y tiempo solo de los bloques marcados que tienen AMBOS
 *  campos cargados — un bloque con distancia pero sin cronometrar aporta a
 *  swimDistance pero no aca, porque no hay tiempo con el que dividirlo.
 *  Reutiliza swimPaceSecPer100m sobre el agregado en vez de reimplementar la
 *  division: null si ningun bloque quedo cronometrado (nunca NaN/Infinity). */
export function swimSessionPaceSecPer100m(s: SwimSession): number | null {
  const timed = s.blocks.filter(b => b.done && b.distanceM != null && b.timeSec != null)
  const distanceM = timed.reduce((a, b) => a + (b.distanceM ?? 0), 0)
  const timeSec = timed.reduce((a, b) => a + (b.timeSec ?? 0), 0)
  return swimPaceSecPer100m({ distanceM, timeSec })
}

/** Velocidad media en m/min (F1-6): la misma informacion que el ritmo, pero
 *  con el eje ya apuntando "mas alto es mejor", que es la direccion que
 *  Chart.tsx ya dibuja sin invertir (ver "Graficas" en el plan). 100 m /
 *  (paceSec/60) = 6000/paceSec. Guarda contra pace === 0 (tiempo total 0 con
 *  distancia cargada) para nunca devolver Infinity. */
export function swimSessionSpeedMPerMin(s: SwimSession): number | null {
  const pace = swimSessionPaceSecPer100m(s)
  return pace != null && pace > 0 ? 6000 / pace : null
}

/** Camino de fin de natacion (R7). A diferencia del fin de fuerza en
 *  Train.tsx (`sets: active.sets.filter(s => s.done)`), esto NUNCA
 *  descarta un bloque por su marca de `done`: persiste todo lo cargado tal
 *  cual. `now` se recibe en vez de llamar a Date.now() aca adentro para que
 *  la funcion sea pura y comprobable por su valor de retorno. */
export function finishSwimSession(s: SwimSession, now: number): SwimSession {
  return { ...s, finishedAt: now }
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

