// Semaforo de dolor del plan (regla de oro 5): se muestra con texto, no solo color.
import { describe, expect, it } from 'vitest'
import { PAIN_MAX, isPainValue, painVerdict } from './pain'

describe('painVerdict', () => {
  it.each([
    [0, 'ok', 'Bien'],
    [2, 'ok', 'Bien'],
    [3, 'adjust', 'Baja peso o rango'],
    [5, 'adjust', 'Baja peso o rango'],
    [6, 'change', 'Cambia el ejercicio'],
    [10, 'change', 'Cambia el ejercicio'],
  ] as const)('dolor %i es nivel %s: "%s"', (value, level, label) => {
    const v = painVerdict(value)
    expect(v.level).toBe(level)
    expect(v.label).toBe(label)
    expect(v.detail.length).toBeGreaterThan(0)
  })
})

describe('isPainValue', () => {
  it('acepta enteros de 0 a 10 y rechaza el resto', () => {
    expect(PAIN_MAX).toBe(10)
    expect(isPainValue(0)).toBe(true)
    expect(isPainValue(10)).toBe(true)
    expect(isPainValue(11)).toBe(false)
    expect(isPainValue(-1)).toBe(false)
    expect(isPainValue(2.5)).toBe(false)
    expect(isPainValue('3')).toBe(false)
  })
})
