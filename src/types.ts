export type RoutineId = 'dia1' | 'dia2' | 'dia3'

export interface Exercise {
  /** Identificador estable. No cambiarlo nunca: es la llave del historial. */
  id: string
  name: string
  /** Series objetivo en las semanas 3 a 7. En las semanas 1-2 y en la 8 se resta una. */
  sets: number
  repsLow: number
  repsHigh: number
  /** Como ajustar y ejecutar la maquina. */
  cue: string
  /** Slug de MuscleWiki en espanol. */
  mwSlug: string
  /** Descanso sugerido en segundos. */
  restSec: number
  /** Marca el ejercicio principal de la sesion. */
  main?: boolean
}

export interface Routine {
  id: RoutineId
  name: string
  zone: string
  warmup: string
  exercises: Exercise[]
}

export interface SetLog {
  exerciseId: string
  setIndex: number
  weight: number | null
  reps: number | null
  done: boolean
}

export type SessionKind = 'strength' | 'swim'

/** Campos comunes a toda sesion, sin importar la disciplina. No se exporta:
 *  es un detalle de construccion de StrengthSession/SwimSession, no un tipo
 *  que otro modulo deba nombrar. */
interface SessionBase {
  id: string
  /** Fecha local en formato YYYY-MM-DD. */
  date: string
  startedAt: number
  finishedAt: number | null
  notes: string
}

/** Sesion de fuerza: la unica disciplina que existia antes de este cambio.
 *  routineId vive SOLO aca — esa es la linea que vuelve irrepresentable una
 *  sesion de natacion con rutina. */
export interface StrengthSession extends SessionBase {
  kind: 'strength'
  routineId: RoutineId
  sets: SetLog[]
}

/** Estilo de un bloque de natacion. Todavia no hay forma de elegirlo desde la
 *  interfaz (llega en F1-5); el tipo existe para que SwimBlock sea
 *  representable desde ahora. */
export type SwimStroke = 'freestyle' | 'backstroke' | 'breaststroke' | 'butterfly' | 'mixed'

export interface SwimBlock {
  index: number
  /** Metros, no largos: cambiar el largo de la piscina no debe reescribir el
   *  historial. */
  distanceM: number | null
  timeSec: number | null
  stroke: SwimStroke
  done: boolean
}

export interface SwimSession extends SessionBase {
  kind: 'swim'
  poolLengthM: number
  blocks: SwimBlock[]
  /** Percepcion de esfuerzo (RPE), 1 a 10. Opcional por eso null. */
  rpe: number | null
}

/** sets (StrengthSession) y blocks (SwimSession) llevan nombres DISTINTOS a
 *  proposito: si ambas ramas usaran el mismo nombre, un acceso sin estrechar
 *  como `s.sets.filter(x => x.done)` seguiria compilando sobre una
 *  SwimSession y solo fallaria en runtime. Con nombres distintos, todo
 *  acceso sin estrechar es un error de compilacion, lo que convierte
 *  `pnpm typecheck` en la lista de verificacion de la migracion. */
export type Session = StrengthSession | SwimSession

/** Compuerta de exhaustividad para tablas indexadas por disciplina (ver
 *  disciplines.ts). Agregar un SessionKind sin agregarlo aca es imposible:
 *  no hay a que mapear. */
export type SessionByKind = { [K in SessionKind]: Extract<Session, { kind: K }> }

export interface ExerciseMeta {
  exerciseId: string
  /** Numero de asiento u observacion de ajuste de la maquina. */
  seat: string
  note: string
}

export interface Measurement {
  /** YYYY-MM-DD, tambien es la llave primaria. */
  date: string
  weight: number
  fatPct?: number
  fatMass?: number
  muscle?: number
  water?: number
  waist?: number
  hip?: number
  chest?: number
  neck?: number
}

export interface DerivedMeasurement extends Measurement {
  leanMass: number | null
  ratio: number | null
  ffmi: number | null
  bmi: number | null
  waistHeight: number | null
  waterOverLean: number | null
}

export type DayKind = 'training' | 'swim' | 'walk' | 'rest' | 'custom'

interface DayBase {
  /** Vacio = se deriva al renderizar. Nunca se guarda el nombre de la rutina. */
  title: string
  note: string
}

/** Dia de entreno: la rutina es obligatoria, no opcional. */
export interface TrainingDay extends DayBase {
  kind: 'training'
  routineId: RoutineId
}

/** Cualquier otro dia: no hay rutina que resolver. */
export interface OtherDay extends DayBase {
  kind: Exclude<DayKind, 'training'>
}

export type DayPlan = TrainingDay | OtherDay

/** Indice 0 = domingo .. 6 = sabado, igual que Date.getDay(). */
export type WeeklyRoutine = readonly [DayPlan, DayPlan, DayPlan, DayPlan, DayPlan, DayPlan, DayPlan]

export interface Config {
  heightCm: number
  blockStart: string
  blockEnd: string
  goal: Required<Omit<Measurement, 'date'>>
  /** Plan de los 7 dias, indexado por Date.getDay(). */
  weeklyRoutine: WeeklyRoutine
  /** Largo de la piscina en metros. Escalar plano a proposito (ver
   *  mergeConfig): un objeto anidado reintroduciria el defecto de campo sin
   *  rellenar de 53590ef. */
  poolLengthM: number
}

/** version 1 = una sola disciplina (fuerza), sin `kind` en el registro de
 *  sesion. version 2 = union discriminada con normalizeSession aplicado al
 *  leer. Union literal a proposito, no `number`: un `number` desnudo pierde
 *  la compuerta de compilacion que obliga a decidir que hacer con cada
 *  version nueva. */
export interface Backup {
  app: 'fitplan'
  version: 1 | 2
  exportedAt: string
  sessions: Session[]
  measurements: Measurement[]
  exerciseMeta: ExerciseMeta[]
  config: Config | null
}
