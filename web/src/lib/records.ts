import type { Session, SetLog, StrengthSession } from './types'
import { bestSet, bySessionTime, fmt, setVolume } from './calc'

/* Personal records per exercise (decision D3-A), derived from saved sessions:
 * nothing here is stored or synced.
 * - Best weight: the heaviest weight in any done set (ties go to more reps,
 *   the same order as bestSet).
 * - Best volume: the highest weight × reps summed over one session for that
 *   exercise (the figure the "Volumen del ejercicio" chart plots).
 * Sets without weight or reps never count. */

export interface BestWeight {
  weight: number
  reps: number | null
  date: string
  sessionId: string
}

export interface BestVolume {
  volume: number
  date: string
  sessionId: string
}

export interface PersonalRecords {
  bestWeight: BestWeight | null
  bestVolume: BestVolume | null
}

export type BrokenRecord =
  | { exerciseId: string; kind: 'weight'; value: number; reps: number | null; previous: number }
  | { exerciseId: string; kind: 'volume'; value: number; previous: number }

/** Done sets of one exercise that carry both a weight and reps. */
const countedSets = (sets: readonly SetLog[], exerciseId: string): SetLog[] =>
  sets.filter(s => s.exerciseId === exerciseId && s.done && s.weight != null && s.reps != null)

/** Weight × reps summed over the exercise's done sets in one session. */
export const exerciseVolume = (sets: readonly SetLog[], exerciseId: string): number =>
  countedSets(sets, exerciseId).reduce((a, s) => a + setVolume(s), 0)

/** True when `a` happened before `b`, in the app's one session order
 *  (bySessionTime: date first, then start time on the same day). */
export const isBefore = (a: StrengthSession, b: StrengthSession): boolean => bySessionTime(a, b) < 0

/** All-time records of an exercise across every routine. With `before`, only
 *  the finished sessions that happened before that one count. */
export function personalRecords(
  sessions: readonly Session[],
  exerciseId: string,
  before?: StrengthSession,
): PersonalRecords {
  let bestWeight: BestWeight | null = null
  let bestVolume: BestVolume | null = null
  for (const s of sessions) {
    if (s.kind !== 'strength' || s.finishedAt == null) continue
    if (before && (s.id === before.id || !isBefore(s, before))) continue
    const top = bestSet(countedSets(s.sets, exerciseId), exerciseId)
    if (top && top.weight != null) {
      const better =
        !bestWeight || top.weight > bestWeight.weight || (top.weight === bestWeight.weight && (top.reps ?? 0) > (bestWeight.reps ?? 0))
      if (better) bestWeight = { weight: top.weight, reps: top.reps, date: s.date, sessionId: s.id }
    }
    const volume = exerciseVolume(s.sets, exerciseId)
    if (volume > 0 && (!bestVolume || volume > bestVolume.volume)) {
      bestVolume = { volume, date: s.date, sessionId: s.id }
    }
  }
  return { bestWeight, bestVolume }
}

/** Records the session beats, per exercise in the order they were logged.
 *  Strictly greater only; an exercise with no earlier record has nothing to
 *  beat, so a first session never yields one. Works on a session in progress
 *  (only done sets count) and on a finished one. */
export function recordsBroken(session: StrengthSession, history: readonly Session[]): BrokenRecord[] {
  const out: BrokenRecord[] = []
  const ids = [...new Set(session.sets.map(s => s.exerciseId))]
  for (const exerciseId of ids) {
    const prior = personalRecords(history, exerciseId, session)
    const top = bestSet(countedSets(session.sets, exerciseId), exerciseId)
    if (prior.bestWeight && top && top.weight != null && top.weight > prior.bestWeight.weight) {
      out.push({ exerciseId, kind: 'weight', value: top.weight, reps: top.reps, previous: prior.bestWeight.weight })
    }
    const volume = exerciseVolume(session.sets, exerciseId)
    if (prior.bestVolume && volume > prior.bestVolume.volume) {
      out.push({ exerciseId, kind: 'volume', value: volume, previous: prior.bestVolume.volume })
    }
  }
  return out
}

/* ---------- copy ---------- */

/** "65" or "62,5": a weight without a trailing ",0". */
export const formatKg = (kg: number): string => (Number.isInteger(kg) ? String(kg) : fmt(kg))

/** "2.400": a volume rounded to whole kilograms with a thousands separator. */
export const formatVolume = (kg: number): string => Math.round(kg).toLocaleString('es-CO')

const recordKg = (r: BrokenRecord): string => (r.kind === 'weight' ? formatKg(r.value) : formatVolume(r.value))

/** Toast shown during the session: "Nuevo récord: 65 kg en Prensa". */
export const recordToast = (r: BrokenRecord, name: string): string =>
  r.kind === 'weight' ? `Nuevo récord: ${recordKg(r)} kg en ${name}` : `Nuevo récord de volumen: ${recordKg(r)} kg en ${name}`

/** Line of the closing summary: "Prensa: 65 kg, nuevo mejor peso". */
export const recordLine = (r: BrokenRecord, name: string): string =>
  `${name}: ${recordKg(r)} kg, nuevo mejor ${r.kind === 'weight' ? 'peso' : 'volumen'}`
