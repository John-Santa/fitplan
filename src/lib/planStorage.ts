// Lectura defensiva del plan guardado en IndexedDB. Lo que hay en disco puede
// venir de otra version del codigo, de un respaldo editado a mano o estar
// corrupto: normalizePlan reconstruye el plan campo por campo (los campos
// desconocidos se descartan) y devuelve null cuando no es utilizable, para
// que el llamador caiga al plan por defecto en vez de reventar.
import type {
  ExerciseCategory,
  LibraryExercise,
  Phase,
  PlanRoutine,
  PlanSlot,
  RoutineBlock,
  SetsRule,
  Target,
  TrainingPlan,
  WeeklyRoutine,
} from '../types'
import { isDayPlan } from './plan'

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const optBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
const strList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every(isStr) ? [...v] : null

/** Mapea cada elemento con `fn`; si alguno no es valido, todo el arreglo lo
 *  es (null): un plan a medio leer es peor que ninguno. */
function mapAll<T>(v: unknown, fn: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null
  const out: T[] = []
  for (const x of v) {
    const r = fn(x)
    if (r === null) return null
    out.push(r)
  }
  return out
}

function readTarget(v: unknown): Target | null {
  if (!isRec(v)) return null
  const perSide = optBool(v.perSide)
  const side = perSide === undefined ? {} : { perSide }
  switch (v.kind) {
    case 'reps': {
      if (!isNum(v.low) || !isNum(v.high)) return null
      if (v.holdSec !== undefined && !isNum(v.holdSec)) return null
      return {
        kind: 'reps',
        low: v.low,
        high: v.high,
        ...side,
        ...(v.holdSec !== undefined ? { holdSec: v.holdSec as number } : {}),
        ...(v.sideUnit === 'pierna' ? { sideUnit: 'pierna' as const } : {}),
      }
    }
    case 'time':
      return isNum(v.lowSec) && isNum(v.highSec) ? { kind: 'time', lowSec: v.lowSec, highSec: v.highSec, ...side } : null
    case 'distance':
      return isNum(v.meters) ? { kind: 'distance', meters: v.meters, ...side } : null
    case 'note':
      return { kind: 'note' }
    default:
      return null
  }
}

function readSlot(v: unknown): PlanSlot | null {
  if (!isRec(v)) return null
  if (!isId(v.id) || !isId(v.exerciseId) || !isNum(v.sets) || !isNum(v.restSec) || !isStr(v.note)) return null
  const target = readTarget(v.target)
  if (!target) return null
  const slot: PlanSlot = { id: v.id, exerciseId: v.exerciseId, sets: v.sets, target, restSec: v.restSec, note: v.note }
  if (typeof v.primary === 'boolean') slot.primary = v.primary
  if (isStr(v.group)) slot.group = v.group
  if (v.weeks !== undefined) {
    if (!isRec(v.weeks) || !isNum(v.weeks.from) || (v.weeks.to !== undefined && !isNum(v.weeks.to))) return null
    slot.weeks = { from: v.weeks.from, ...(v.weeks.to !== undefined ? { to: v.weeks.to as number } : {}) }
  }
  return slot
}

function readBlock(v: unknown): RoutineBlock | null {
  if (!isRec(v) || !isId(v.id) || !isStr(v.title) || !isStr(v.note)) return null
  const slots = mapAll(v.slots, readSlot)
  return slots ? { id: v.id, title: v.title, note: v.note, slots } : null
}

function readRoutine(v: unknown): PlanRoutine | null {
  if (!isRec(v) || !isId(v.id)) return null
  if (!isStr(v.name) || !isStr(v.focus) || !isStr(v.intro) || !isStr(v.duration)) return null
  if (typeof v.warmup !== 'boolean') return null
  const blocks = mapAll(v.blocks, readBlock)
  if (!blocks) return null
  const r: PlanRoutine = { id: v.id, name: v.name, focus: v.focus, intro: v.intro, duration: v.duration, warmup: v.warmup, blocks }
  if (typeof v.archived === 'boolean') r.archived = v.archived
  return r
}

function readRule(v: unknown): SetsRule | null {
  if (!isRec(v)) return null
  switch (v.kind) {
    case 'cap':
      return isNum(v.sets) ? { kind: 'cap', sets: v.sets } : null
    case 'primaryBoost':
      return isNum(v.sets) ? { kind: 'primaryBoost', sets: v.sets } : null
    case 'base':
      return { kind: 'base' }
    case 'half':
      return { kind: 'half' }
    default:
      return null
  }
}

function readPhase(v: unknown): Phase | null {
  if (!isRec(v) || !isNum(v.fromWeek) || !isNum(v.toWeek)) return null
  if (!isStr(v.sets) || !isStr(v.intensity) || !isStr(v.goal) || !isStr(v.loadNote)) return null
  const rule = readRule(v.rule)
  return rule
    ? { fromWeek: v.fromWeek, toWeek: v.toWeek, sets: v.sets, intensity: v.intensity, goal: v.goal, rule, loadNote: v.loadNote }
    : null
}

const CATEGORIES: readonly ExerciseCategory[] = ['strength', 'core', 'mobility', 'cardio']

function readLibraryExercise(v: unknown): LibraryExercise | null {
  if (!isRec(v) || !isId(v.id) || !isStr(v.name) || !isStr(v.equipment)) return null
  if (!CATEGORIES.includes(v.category as ExerciseCategory)) return null
  const primaryMuscles = strList(v.primaryMuscles)
  const secondaryMuscles = strList(v.secondaryMuscles)
  const steps = strList(v.steps)
  const cues = strList(v.cues)
  if (!primaryMuscles || !secondaryMuscles || !steps || !cues) return null
  if (!isRec(v.musclewiki)) return null
  const { slug, id } = v.musclewiki
  if (!(slug === null || isStr(slug)) || !(id === null || isNum(id))) return null
  const ex: LibraryExercise = {
    id: v.id,
    name: v.name,
    category: v.category as ExerciseCategory,
    equipment: v.equipment,
    primaryMuscles,
    secondaryMuscles,
    steps,
    cues,
    musclewiki: { slug, id },
  }
  if (isStr(v.alternativeId)) ex.alternativeId = v.alternativeId
  if (isStr(v.alternativeText)) ex.alternativeText = v.alternativeText
  if (typeof v.custom === 'boolean') ex.custom = v.custom
  return ex
}

function readWeek(v: unknown): WeeklyRoutine | null {
  if (!Array.isArray(v) || v.length !== 7) return null
  const days = mapAll(v, d => (isDayPlan(d) ? (d.kind === 'training'
    ? { kind: 'training' as const, routineId: d.routineId, title: d.title, note: d.note }
    : { kind: d.kind, title: d.title, note: d.note }) : null))
  return days as unknown as WeeklyRoutine | null
}

/** Valida y reconstruye un plan leido de disco. null = no utilizable.
 *  customExercises ausente (planes escritos antes de existir) pasa a []. */
export function normalizePlan(raw: unknown): TrainingPlan | null {
  if (!isRec(raw) || raw.schemaVersion !== 1) return null
  if (!isId(raw.id) || !isStr(raw.name) || !isNum(raw.weeks)) return null
  const warmup = readBlock(raw.warmup)
  const routines = mapAll(raw.routines, readRoutine)
  const phases = mapAll(raw.phases, readPhase)
  const weekTemplate = readWeek(raw.weekTemplate)
  const tips = strList(raw.tips)
  const customExercises = raw.customExercises === undefined ? [] : mapAll(raw.customExercises, readLibraryExercise)
  if (!warmup || !routines || !phases || !weekTemplate || !tips || !customExercises) return null
  return { id: raw.id, name: raw.name, schemaVersion: 1, weeks: raw.weeks, warmup, routines, phases, weekTemplate, tips, customExercises }
}

/** Plan a guardar al importar un respaldo: el del archivo si trae uno legible,
 *  null si no (respaldos v1/v2, o plan corrupto) y entonces se conserva el
 *  plan actual. */
export function planFromBackup(data: unknown): TrainingPlan | null {
  return isRec(data) ? normalizePlan(data.plan) : null
}
