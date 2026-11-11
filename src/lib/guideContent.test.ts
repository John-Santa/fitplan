import { describe, expect, it } from 'vitest'
import {
  AVOID_ROWS,
  GOLDEN_RULES,
  HABITS,
  RED_FLAGS,
  URGENT_RED_FLAG,
} from './guideContent'

describe('guideContent: texto verbatim de la guia', () => {
  it('la señal urgente es la linea de urgencia de L1', () => {
    expect(URGENT_RED_FLAG).toBe(
      'Pérdida de control de orina o esfínteres, o adormecimiento en la zona genital: esto es urgencia, ve a la clínica ese mismo día.',
    )
    expect(RED_FLAGS.filter(f => f.urgent).map(f => f.text)).toEqual([URGENT_RED_FLAG])
  })

  it('la regla 5 es el semaforo del dolor', () => {
    expect(GOLDEN_RULES[4]).toBe(
      'Regla del semáforo para el dolor: 0–2/10 que se va al terminar está bien; 3–5/10 baja peso o rango; más de 5/10 o que se queda al día siguiente, cambia el ejercicio.',
    )
  })

  it('una fila de la tabla de evitar es verbatim', () => {
    expect(AVOID_ROWS[1]).toEqual({
      avoid: 'Sentadilla con barra en la espalda',
      why: 'Carga directa y alta sobre la columna',
      replacement: 'Prensa, goblet squat, split squat en multipower',
    })
  })

  it('un habito es verbatim', () => {
    expect(HABITS[3]).toBe(
      'Proteína: apunta a 1,6–2 g por kg de peso al día (pollo, huevos, carne, lácteos, legumbres, whey si te queda práctico).',
    )
  })
})

describe('guideContent: conteos', () => {
  it('4 señales de alarma, 6 reglas de oro, 8 filas a evitar, 6 habitos', () => {
    expect(RED_FLAGS).toHaveLength(4)
    expect(GOLDEN_RULES).toHaveLength(6)
    expect(AVOID_ROWS).toHaveLength(8)
    expect(HABITS).toHaveLength(6)
  })
})
