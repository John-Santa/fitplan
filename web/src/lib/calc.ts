import type { Measurement, DerivedMeasurement, Session, SetLog, StrengthSession } from './types'

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

/** Dias transcurridos entre un timestamp epoch y ahora. */
export const daysSince = (ts: number): number => Math.floor((Date.now() - ts) / 86400000)

export const mmss = (sec: number) =>
  `${Math.floor(Math.max(sec, 0) / 60)}:${String(Math.max(sec, 0) % 60).padStart(2, '0')}`

/* ---------- metricas de entrenamiento ---------- */

export const setVolume = (s: SetLog) => (s.done && s.weight != null && s.reps != null ? s.weight * s.reps : 0)

/** Tipadas a StrengthSession a proposito: solo la fuerza tiene .sets, y una
 *  SwimSession que llegara sin estrechar aca es exactamente el defecto que
 *  motivo este cambio (ver R1 en el plan). */
export const sessionVolume = (s: StrengthSession) => s.sets.reduce((a, x) => a + setVolume(x), 0)

export const doneSets = (s: StrengthSession) => s.sets.filter(x => x.done).length

/** Mejor serie de un ejercicio en una sesion, por peso y luego por reps. */
export function bestSet(sets: SetLog[], exerciseId: string): SetLog | null {
  const c = sets.filter(s => s.exerciseId === exerciseId && s.done && s.weight != null)
  if (!c.length) return null
  return c.reduce((a, b) =>
    (b.weight ?? 0) > (a.weight ?? 0) || ((b.weight ?? 0) === (a.weight ?? 0) && (b.reps ?? 0) > (a.reps ?? 0)) ? b : a,
  )
}

/** Orden cronologico de las sesiones, de la mas antigua a la mas nueva: por la
 *  fecha de la sesion (ISO, se ordena como texto) y, a igual fecha, por
 *  startedAt. Una sesion cargada despues para un dia pasado recibe
 *  startedAt = ahora, asi que startedAt solo no sirve: queda en su propio dia.
 *  Es el unico orden que usan "la vez pasada", los records, las graficas de
 *  progreso y la lista de sesiones; para la mas nueva primero, `(a, b) =>
 *  bySessionTime(b, a)`. */
export const bySessionTime = (a: Pick<Session, 'date' | 'startedAt'>, b: Pick<Session, 'date' | 'startedAt'>): number =>
  a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1

/** Series de la sesion completada mas reciente (segun bySessionTime) para ese
 *  ejercicio. */
export function lastPerformance(
  sessions: StrengthSession[],
  exerciseId: string,
  excludeId?: string,
  /** The session being logged: only sessions before it count, so a session
   *  logged for a past date is compared with what came before that date (the
   *  same cutoff the records and the closing summary use). */
  before?: Pick<Session, 'date' | 'startedAt'>,
) {
  const ordered = sessions
    .filter(s => s.finishedAt && s.id !== excludeId && (!before || bySessionTime(s, before) < 0))
    .sort((a, b) => bySessionTime(b, a))
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

/** Resumen de la sesion anterior: un solo peso si todas las series lo comparten. */
export function formatLastPerformance(sets: SetLog[]): string {
  if (!sets.length) return '—'
  const w = sets[0].weight
  return sets.every(s => s.weight === w)
    ? `${fmt(w)} kg × ${sets.map(s => s.reps ?? '—').join(' · ')}`
    : sets.map(s => `${fmt(s.weight)} kg × ${s.reps ?? '—'}`).join('  ·  ')
}

const CARDINALES = ['una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']

/** "Cerraste las cuatro series en 12. Hoy va la siguiente placa." */
export function progressLine(setCount: number, reps: number): string {
  const series = setCount === 1 ? 'la serie' : `las ${CARDINALES[setCount - 1] ?? setCount} series`
  return `Cerraste ${series} en ${reps}. Hoy va la siguiente placa.`
}

// weeklyCount, weeklyVolume, weeklySetCount y blockSessionCount se movieron a
// lib/disciplines.ts: se documentaban como "sesiones de fuerza" pero
// filtraban solo por fecha y finishedAt, sin mirar la disciplina (R1). El
// traslado obliga a cada consumidor a cambiar tambien su linea de import.
