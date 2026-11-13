import type { Config } from '../../../lib/types'

type GoalKey = keyof Config['goal']

// Pure builders for the Config each Ajustes control saves. They hold the exact
// validation the inline handlers had before the screen was regrouped; null
// means "do not save".

/** Height in cm: saved only when numeric and above 100. */
export function heightPatch(config: Config, raw: string): Config | null {
  const v = Number(raw)
  return !Number.isNaN(v) && v > 100 ? { ...config, heightCm: v } : null
}

/** Pool length in metres: saved only when numeric and positive. */
export function poolLengthPatch(config: Config, raw: string): Config | null {
  const v = Number(raw)
  return !Number.isNaN(v) && v > 0 ? { ...config, poolLengthM: v } : null
}

/** One block goal: saved whenever the value is numeric. */
export function goalPatch(config: Config, key: GoalKey, raw: string): Config | null {
  const v = Number(raw)
  return Number.isNaN(v) ? null : { ...config, goal: { ...config.goal, [key]: v } }
}

/** Block dates are saved as typed, with no validation. */
export function blockStartPatch(config: Config, value: string): Config {
  return { ...config, blockStart: value }
}

export function blockEndPatch(config: Config, value: string): Config {
  return { ...config, blockEnd: value }
}
