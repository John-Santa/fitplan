// Carga sugerida para hoy. Pura y derivada: sale de la sesion anterior y de la
// fase de la semana, no se guarda ni se sincroniza (decision D1-A).
import type { Phase, PlanSlot, SetLog } from './types'
import { shouldProgress } from './calc'

/** Una placa: el paso del stepper de peso. */
export const PLATE_KG = 2.5

export type LoadReason = 'progress' | 'deload' | 'same'

export interface LoadSuggestion {
  weight: number
  reason: LoadReason
  /** Por que, para la linea "Sugerido hoy: 62,5 kg · <text>". */
  text: string
}

/** Peso sin ceros de mas y con coma decimal: "60", "62,5". */
export function fmtKg(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return String(Math.round(v * 100) / 100).replace('.', ',')
}

/** El unico lugar que lee el texto de la fase para saber si la carga baja a la
 *  mitad (ambas plantillas lo dicen asi en la semana de descarga). Si el plan
 *  gana un factor de carga estructurado, se reemplaza solo esta funcion. */
export function isHalfWeightPhase(phase: Pick<Phase, 'loadNote'> | null): boolean {
  return phase != null && /mitad de peso/i.test(phase.loadNote)
}

const toPlate = (kg: number): number => Math.round(kg / PLATE_KG) * PLATE_KG

/**
 * Carga de hoy para la serie `setIndex` de un slot de repeticiones, o null si
 * no hay sugerencia (primera vez, sin peso previo, o el objetivo no es de
 * repeticiones). La serie de referencia es la del mismo indice o, si la sesion
 * anterior tuvo menos series, la ultima.
 *  - Fase de "la mitad de peso": la mitad del peso anterior, a la placa mas cercana.
 *  - Doble progresion cumplida (shouldProgress): una placa mas.
 *  - Si no: el mismo peso.
 */
export function suggestLoad(
  prevSets: SetLog[],
  setIndex: number,
  slot: Pick<PlanSlot, 'target'>,
  expectedSets: number,
  phase: Pick<Phase, 'loadNote'> | null,
): LoadSuggestion | null {
  const target = slot.target
  if (target.kind !== 'reps') return null
  const ref = prevSets[setIndex] ?? prevSets[prevSets.length - 1]
  if (ref?.weight == null) return null
  if (isHalfWeightPhase(phase)) {
    return { weight: toPlate(ref.weight / 2), reason: 'deload', text: 'Semana de descarga: la mitad de peso' }
  }
  if (shouldProgress(prevSets, expectedSets, target.high)) {
    return { weight: ref.weight + PLATE_KG, reason: 'progress', text: 'Sube una placa' }
  }
  return { weight: ref.weight, reason: 'same', text: 'Mismo peso, suma repeticiones' }
}
