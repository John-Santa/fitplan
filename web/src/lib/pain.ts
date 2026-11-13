// Semaforo de dolor del plan (regla de oro 5): "0–2/10 que se va al terminar
// está bien; 3–5/10 baja peso o rango; más de 5/10 o que se queda al día
// siguiente, cambia el ejercicio". Puro: la vista decide icono y color, pero
// el veredicto siempre se muestra con texto.

import type { Session } from './types'
import { weekDays } from '../features/habit/lib/week'

export const PAIN_MAX = 10

export type PainLevel = 'ok' | 'adjust' | 'change'

export interface PainVerdict {
  level: PainLevel
  label: string
  detail: string
}

/** Enteros de 0 a 10. Cualquier otra cosa no es un dolor registrable. */
export function isPainValue(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= PAIN_MAX
}

export function painVerdict(value: number): PainVerdict {
  if (value <= 2) return { level: 'ok', label: 'Bien', detail: 'Si se va al terminar, sigue como estás.' }
  if (value <= 5) return { level: 'adjust', label: 'Baja peso o rango', detail: 'Reduce la carga o el recorrido en las próximas series.' }
  return { level: 'change', label: 'Cambia el ejercicio', detail: 'Usa la alternativa o salta este ejercicio hoy.' }
}

export interface PainWeek {
  /** Monday (YYYY-MM-DD) of the calendar week. */
  monday: string
  /** Highest pain recorded for the exercise that week. */
  max: number
}

export interface ExercisePainHistory {
  exerciseId: string
  /** Newest week first. */
  weeks: PainWeek[]
}

/** Pain per exercise and calendar week (Monday..Sunday) from the pain recorded
 *  in strength sessions; a week's value is its maximum. Exercises with no valid
 *  pain are omitted. Read-only: derives everything from existing sessions. */
export function painByExerciseWeek(sessions: readonly Session[]): ExercisePainHistory[] {
  const byExercise = new Map<string, Map<string, number>>()
  for (const s of sessions) {
    if (s.kind !== 'strength' || !s.pain) continue
    const monday = weekDays(s.date)[0]
    for (const [exerciseId, value] of Object.entries(s.pain)) {
      if (!isPainValue(value)) continue
      const weeks = byExercise.get(exerciseId) ?? new Map<string, number>()
      weeks.set(monday, Math.max(weeks.get(monday) ?? 0, value))
      byExercise.set(exerciseId, weeks)
    }
  }
  return [...byExercise.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([exerciseId, weeks]) => ({
      exerciseId,
      weeks: [...weeks.entries()].map(([monday, max]) => ({ monday, max })).sort((a, b) => (a.monday < b.monday ? 1 : -1)),
    }))
}
