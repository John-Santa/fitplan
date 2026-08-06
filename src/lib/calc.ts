import type { Measurement, DerivedMeasurement, Session, SetLog } from '../types'

export function derive(m: Measurement, heightCm: number): DerivedMeasurement {
  const h2 = (heightCm / 100) ** 2
  const leanMass = m.fatMass != null ? round1(m.weight - m.fatMass) : null
  return {
    ...m,
    leanMass,
    ratio: m.muscle != null && m.fatMass ? m.muscle / m.fatMass : null,
    ffmi: leanMass != null ? leanMass / h2 : null,
    bmi: m.weight / h2,
    waistHeight: m.waist != null ? m.waist / heightCm : null,
    waterOverLean: m.water != null && leanMass ? (m.water / leanMass) * 100 : null,
  }
}

export const round1 = (v: number) => Math.round(v * 10) / 10
export const round2 = (v: number) => Math.round(v * 100) / 100

export function fmt(v: number | null | undefined, dec = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toFixed(dec).replace('.', ',')
}

export function fmtSigned(v: number | null | undefined, dec = 1): string {
  if (v == null || Number.isNaN(v)) return '—'
  return (v > 0 ? '+' : '') + v.toFixed(dec).replace('.', ',')
}

/** Porcentaje de avance entre la linea base y la meta. */
export function progressPct(current: number, base: number, goal: number): number {
  if (Math.abs(goal - base) < 1e-6) return 100
  return Math.max(0, Math.min(100, ((current - base) / (goal - base)) * 100))
}

export const todayISO = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fmtDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-')
  return `${Number(d)} ${MESES[Number(m) - 1]}${withYear ? ' ' + y.slice(2) : ''}`
}

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

export const mmss = (sec: number) =>
  `${Math.floor(Math.max(sec, 0) / 60)}:${String(Math.max(sec, 0) % 60).padStart(2, '0')}`

/* ---------- metricas de entrenamiento ---------- */

export const setVolume = (s: SetLog) => (s.done && s.weight != null && s.reps != null ? s.weight * s.reps : 0)

export const sessionVolume = (s: Session) => s.sets.reduce((a, x) => a + setVolume(x), 0)

export const doneSets = (s: Session) => s.sets.filter(x => x.done).length

/** Mejor serie de un ejercicio en una sesion, por peso y luego por reps. */
export function bestSet(sets: SetLog[], exerciseId: string): SetLog | null {
  const c = sets.filter(s => s.exerciseId === exerciseId && s.done && s.weight != null)
  if (!c.length) return null
  return c.reduce((a, b) =>
    (b.weight ?? 0) > (a.weight ?? 0) || ((b.weight ?? 0) === (a.weight ?? 0) && (b.reps ?? 0) > (a.reps ?? 0)) ? b : a,
  )
}

/** Series de la sesion completada mas reciente para ese ejercicio. */
export function lastPerformance(sessions: Session[], exerciseId: string, excludeId?: string) {
  const ordered = sessions
    .filter(s => s.finishedAt && s.id !== excludeId)
    .sort((a, b) => b.startedAt - a.startedAt)
  for (const s of ordered) {
    const sets = s.sets.filter(x => x.exerciseId === exerciseId && x.done && x.weight != null)
    if (sets.length) return { session: s, sets: sets.sort((a, b) => a.setIndex - b.setIndex) }
  }
  return null
}

/**
 * Doble progresion: si en la ultima sesion completaste todas las series en el
 * extremo alto del rango, toca subir de placa.
 */
export function shouldProgress(sets: SetLog[], expectedSets: number, repsHigh: number): boolean {
  const done = sets.filter(s => s.done && s.reps != null)
  if (done.length < expectedSets) return false
  return done.every(s => (s.reps ?? 0) >= repsHigh)
}

/** Racha de semanas con al menos 3 sesiones de fuerza terminadas. */
export function weeklyCount(sessions: Session[], weeksBack = 8) {
  const out: { week: string; count: number }[] = []
  const now = new Date()
  for (let i = weeksBack - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 86400000)
    const start = new Date(end.getTime() - 6 * 86400000)
    const a = todayISO(start), b = todayISO(end)
    out.push({ week: b, count: sessions.filter(s => s.finishedAt && s.date >= a && s.date <= b).length })
  }
  return out
}

/** Rango ISO [inicio, fin] de la semana actual, mismo criterio de limites que usa weeklyCount(). */
function currentWeekRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getTime() - 6 * 86400000)
  return { start: todayISO(start), end: todayISO(now) }
}

/** Volumen total (kg) de las sesiones de fuerza terminadas en la semana actual. */
export function weeklyVolume(sessions: Session[]): number {
  const { start, end } = currentWeekRange()
  return sessions
    .filter(s => s.finishedAt && s.date >= start && s.date <= end)
    .reduce((a, s) => a + sessionVolume(s), 0)
}

/** Series completadas en las sesiones de fuerza terminadas en la semana actual. */
export function weeklySetCount(sessions: Session[]): number {
  const { start, end } = currentWeekRange()
  return sessions
    .filter(s => s.finishedAt && s.date >= start && s.date <= end)
    .reduce((a, s) => a + doneSets(s), 0)
}

/** Sesiones terminadas dentro del bloque vigente. */
export function blockSessionCount(sessions: Session[], blockStart: string, blockEnd: string): number {
  return sessions.filter(s => s.finishedAt != null && s.date >= blockStart && s.date <= blockEnd).length
}
