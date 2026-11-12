// Three-way field merge of the config document (F26/F27, S15, option B: the
// client merges, the API keeps last-write-wins per document).
//
// Inputs: the last synced base (what both sides started from, or null when
// this install never stored one), the local copy and the remote copy, each
// with the updatedAt of its whole document. Rules, per unit:
// - Scalars (heightCm, poolLengthM, each goal field, each weekday of the
//   weekly routine, the block dates as one pair, any field this module does
//   not know): the side that changed it against the base wins; when both
//   changed it differently, the later updatedAt wins (a tie keeps remote,
//   which the server already holds).
// - habitCheckIns, a set keyed by date: a date added on either side stays,
//   a date removed on either side goes. Dates are the local calendar keys
//   (YYYY-MM-DD) the app wrote; they are compared as strings and never
//   parsed, so no timezone can shift them.
// - intentions (keyed by weekday, an empty one counts as absent) and
//   routineExercises (keyed by routine id, absent = default exercises):
//   per-entry three-way merge. Deleted on one side and edited on the other:
//   the edit wins, whatever the clocks say. It is deterministic, survives
//   clock skew, and the deletion (a reset to the default) is cheap to redo,
//   while a lost edit is not.
// - Without a base (an install synced before this module existed) there is
//   no way to tell an addition from a deletion: keyed collections and the
//   check-in set merge as a union, and differing scalars fall back to the
//   later updatedAt, which is what whole-document last-write-wins did.
//
// `discarded` lists the labels of every unit where a local value lost, for
// the "esto cambió en otro dispositivo" notice.
//
// The workout in progress is not part of config: it lives only in this
// device's localStorage (features/session/lib/activeSession.ts) and nothing
// here reads or writes it.
import { MEASUREMENT_LABELS, WEEKDAYS, mergeConfig, routineById } from '../../../lib/plan'
import type { Config, Intention } from '../../../lib/types'

export type ConfigSide = { config: Config; updatedAt: number }
export type ConfigMergeResult = { merged: Config; discarded: string[] }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Comparable form: JSON with sorted object keys. */
function canonical(v: unknown): string | undefined {
  return JSON.stringify(v, (_k, val: unknown) =>
    isObject(val) ? Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]])) : val,
  )
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)

const SCALAR_LABELS: Record<string, string> = {
  heightCm: 'Altura',
  poolLengthM: 'Largo de la piscina',
  block: 'Fechas del bloque',
}

/** Notice shown when a local change lost to another device. */
export function configConflictText(fields: string[]): string {
  return `${fields.join(', ')}: esto cambió en otro dispositivo y se conservó esa versión.`
}

const isEmptyIntention = (i: Intention | undefined) => !i || (i.time === '' && i.place === '')

class Merger {
  readonly discarded: string[] = []
  constructor(
    private readonly hasBase: boolean,
    private readonly localWins: boolean,
  ) {}

  /** One value, present on both sides. */
  scalar<T>(label: string, base: T | undefined, local: T, remote: T): T {
    if (same(local, remote)) return local
    if (this.hasBase) {
      if (same(local, base)) return remote
      if (same(remote, base)) return local
    }
    return this.conflict(label, local, remote)
  }

  /** One entry of a keyed collection; undefined = absent. */
  entry<T>(label: string, base: T | undefined, local: T | undefined, remote: T | undefined): T | undefined {
    if (same(local, remote)) return local
    if (this.hasBase) {
      if (same(local, base)) return remote
      if (same(remote, base)) return local
    } else if (local === undefined || remote === undefined) {
      // No base: union.
      return local ?? remote
    }
    // Deleted on one side, edited on the other: the edit wins.
    if (local === undefined) {
      this.discarded.push(label)
      return remote
    }
    if (remote === undefined) return local
    return this.conflict(label, local, remote)
  }

  private conflict<T>(label: string, local: T, remote: T): T {
    if (this.localWins) return local
    this.discarded.push(label)
    return remote
  }

  keyed<T>(keys: Iterable<string>, label: (k: string) => string, base: (k: string) => T | undefined, local: (k: string) => T | undefined, remote: (k: string) => T | undefined) {
    const out = new Map<string, T>()
    for (const k of new Set(keys)) {
      const v = this.entry(label(k), base(k), local(k), remote(k))
      if (v !== undefined) out.set(k, v)
    }
    return out
  }

  dates(base: string[] | undefined, local: string[], remote: string[]): string[] {
    const l = new Set(local)
    const r = new Set(remote)
    if (!this.hasBase || !base) return [...new Set([...local, ...remote])].sort()
    const b = new Set(base)
    const keep = (d: string) => (l.has(d) && r.has(d)) || (!b.has(d) && (l.has(d) || r.has(d)))
    return [...new Set([...local, ...remote])].filter(keep).sort()
  }
}

/** Merges local and remote config against `base`. The result is normalized
 *  with mergeConfig, like any config entering the app. */
export function mergeConfigs(base: Config | null, local: ConfigSide, remote: ConfigSide): ConfigMergeResult {
  const m = new Merger(base !== null, local.updatedAt > remote.updatedAt)
  const b = base ?? undefined
  const l = local.config
  const r = remote.config
  const out: Record<string, unknown> = {}

  const block = m.scalar(
    SCALAR_LABELS.block,
    b && [b.blockStart, b.blockEnd],
    [l.blockStart, l.blockEnd],
    [r.blockStart, r.blockEnd],
  )
  out.blockStart = block[0]
  out.blockEnd = block[1]

  const goalKeys = Object.keys(MEASUREMENT_LABELS) as (keyof Config['goal'])[]
  out.goal = Object.fromEntries(
    goalKeys.map(k => [k, m.scalar(`Meta de ${MEASUREMENT_LABELS[k].toLowerCase()}`, b?.goal[k], l.goal[k], r.goal[k])]),
  )

  out.weeklyRoutine = l.weeklyRoutine.map((day, i) =>
    m.scalar(`Plan del ${WEEKDAYS[i]}`, b?.weeklyRoutine[i], day, r.weeklyRoutine[i]),
  )

  const intention = (c: Config | undefined, i: number) => {
    const v = c?.intentions[i]
    return isEmptyIntention(v) ? undefined : v
  }
  out.intentions = l.intentions.map((_, i) =>
    m.entry(`Intención del ${WEEKDAYS[i]}`, intention(b, i), intention(l, i), intention(r, i)) ?? { time: '', place: '' },
  )

  const routines = (c: Config | undefined) => (c?.routineExercises ?? {}) as Record<string, unknown>
  out.routineExercises = Object.fromEntries(
    m.keyed(
      [...Object.keys(routines(l)), ...Object.keys(routines(r)), ...Object.keys(routines(b))],
      id => `Ejercicios de ${routineById(id)?.name ?? id}`,
      id => routines(b)[id],
      id => routines(l)[id],
      id => routines(r)[id],
    ),
  )

  out.habitCheckIns = m.dates(b?.habitCheckIns, l.habitCheckIns, r.habitCheckIns)

  // Every other field, known today (heightCm, poolLengthM) or added later,
  // is a scalar.
  const handled = new Set(['blockStart', 'blockEnd', 'goal', 'weeklyRoutine', 'intentions', 'routineExercises', 'habitCheckIns'])
  const rec = (c: Config | undefined) => (c ?? {}) as Record<string, unknown>
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (handled.has(k)) continue
    out[k] = m.scalar(SCALAR_LABELS[k] ?? k, rec(b)[k], rec(l)[k], rec(r)[k])
  }

  return { merged: mergeConfig(out), discarded: m.discarded }
}

/** A local edit made from `seen` (the config a screen read) saved over
 *  `current` (what is stored now, which a sync may have merged meanwhile):
 *  the edit wins where it touched something, `current` keeps the rest. */
export function rebaseConfigEdit(seen: Config, edited: Config, current: Config): Config {
  return mergeConfigs(seen, { config: edited, updatedAt: 1 }, { config: current, updatedAt: 0 }).merged
}
