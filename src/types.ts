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

export interface Session {
  id: string
  routineId: RoutineId
  /** Fecha local en formato YYYY-MM-DD. */
  date: string
  startedAt: number
  finishedAt: number | null
  sets: SetLog[]
  notes: string
}

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
}

export interface Backup {
  app: 'fitplan'
  version: 1
  exportedAt: string
  sessions: Session[]
  measurements: Measurement[]
  exerciseMeta: ExerciseMeta[]
  config: Config | null
}
