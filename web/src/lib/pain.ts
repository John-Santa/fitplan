// Semaforo de dolor del plan (regla de oro 5): "0–2/10 que se va al terminar
// está bien; 3–5/10 baja peso o rango; más de 5/10 o que se queda al día
// siguiente, cambia el ejercicio". Puro: la vista decide icono y color, pero
// el veredicto siempre se muestra con texto.

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
