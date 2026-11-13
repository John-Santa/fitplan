// Natación's plan view (S6, D10-A): one number, the weekly session target,
// plus the pool length. Both are flat Config fields saved with saveConfig.
import type { Config } from '../../../lib/types'

const MIN_TARGET = 1
const MAX_TARGET = 7

/** Config with the weekly target moved by `delta`, or null when the result
 *  would leave 1-7 (nothing to save). */
export function stepSwimTarget(config: Config, delta: number): Config | null {
  const next = config.swimWeeklyTarget + delta
  if (!Number.isInteger(next) || next < MIN_TARGET || next > MAX_TARGET) return null
  return { ...config, swimWeeklyTarget: next }
}

/** Same validation as Settings' pool field: a number greater than 0. */
export function poolLengthUpdate(config: Config, raw: string): Config | null {
  const v = Number(raw)
  if (Number.isNaN(v) || v <= 0) return null
  return { ...config, poolLengthM: v }
}

export default function SwimPlan({ config, saveConfig }: { config: Config; saveConfig: (c: Config) => Promise<void> }) {
  const step = (delta: number) => {
    const next = stepSwimTarget(config, delta)
    if (next) void saveConfig(next)
  }
  return (
    <>
      <h1>Tu plan de natación</h1>
      <div className="card">
        <div className="row">
          <div className="grow">
            <strong>Sesiones por semana</strong>
            <div className="muted">Tu meta semanal de natación.</div>
          </div>
          <button className="ghost" aria-label="Menos sesiones" disabled={config.swimWeeklyTarget <= MIN_TARGET} onClick={() => step(-1)}>−</button>
          <span className="num" aria-live="polite">{config.swimWeeklyTarget}</span>
          <button className="ghost" aria-label="Más sesiones" disabled={config.swimWeeklyTarget >= MAX_TARGET} onClick={() => step(1)}>+</button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <label htmlFor="swim-pool">Largo de la piscina (m)</label>
        <input
          id="swim-pool" type="number" inputMode="decimal" step="0.5" defaultValue={config.poolLengthM}
          onBlur={e => {
            const next = poolLengthUpdate(config, e.target.value)
            if (next) void saveConfig(next)
          }}
        />
      </div>
    </>
  )
}
