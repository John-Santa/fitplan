// Pruebas de mergeConfig (A8/A10). Cubren la regresion de 53590ef: una
// config guardada a la que le falta un campo (de primer nivel o anidado
// dentro de goal) debia repararse en silencio, no propagar undefined.
// Co-ubicadas junto al codigo (no en test/) porque tsconfig.json solo
// incluye "src" y "vite.config.ts": todo lo que este bajo test/ nunca lo
// verifica tsc -b.
import { describe, expect, it } from 'vitest'
import type { Config } from '../types'
import { DEFAULT_CONFIG, mergeConfig } from './plan'

describe('mergeConfig', () => {
  it('rellena un campo de primer nivel faltante (regresion 53590ef)', () => {
    const stored = {
      blockStart: '2020-01-01',
      blockEnd: '2020-02-01',
      goal: DEFAULT_CONFIG.goal,
      weeklyRoutine: DEFAULT_CONFIG.weeklyRoutine,
      // heightCm falta por completo: es exactamente la forma del bug
      // desplegado en 53590ef, donde el objeto guardado no tenia el campo
      // nuevo y el spread lo dejaba pasar sin avisar.
    }
    const merged = mergeConfig(stored)
    expect(merged.heightCm).toBe(DEFAULT_CONFIG.heightCm)
    expect(merged.blockStart).toBe('2020-01-01')
    expect(merged.blockEnd).toBe('2020-02-01')
  })

  it('rellena un campo anidado faltante dentro de goal', () => {
    const stored = { goal: { weight: 70 } }
    const merged = mergeConfig(stored)
    expect(merged.goal.weight).toBe(70)
    expect(merged.goal.fatPct).toBe(DEFAULT_CONFIG.goal.fatPct)
    expect(merged.goal.fatMass).toBe(DEFAULT_CONFIG.goal.fatMass)
    expect(merged.goal.muscle).toBe(DEFAULT_CONFIG.goal.muscle)
    expect(merged.goal.water).toBe(DEFAULT_CONFIG.goal.water)
    expect(merged.goal.waist).toBe(DEFAULT_CONFIG.goal.waist)
    expect(merged.goal.hip).toBe(DEFAULT_CONFIG.goal.hip)
    expect(merged.goal.chest).toBe(DEFAULT_CONFIG.goal.chest)
    expect(merged.goal.neck).toBe(DEFAULT_CONFIG.goal.neck)
  })

  it('goal ausente por completo se llena entero con los valores por defecto', () => {
    const merged = mergeConfig({})
    expect(merged.goal).toEqual(DEFAULT_CONFIG.goal)
  })

  it('repara dia por dia: un dia invalido vuelve al default de ESE dia, el resto sobrevive', () => {
    const week = DEFAULT_CONFIG.weeklyRoutine.map((d, i) => (i === 2 ? { kind: 'bogus' } : d))
    const merged = mergeConfig({ weeklyRoutine: week })
    expect(merged.weeklyRoutine[2]).toEqual(DEFAULT_CONFIG.weeklyRoutine[2])
    expect(merged.weeklyRoutine[0]).toEqual(DEFAULT_CONFIG.weeklyRoutine[0])
    expect(merged.weeklyRoutine[1]).toEqual(DEFAULT_CONFIG.weeklyRoutine[1])
    expect(merged.weeklyRoutine[3]).toEqual(DEFAULT_CONFIG.weeklyRoutine[3])
    expect(merged.weeklyRoutine[4]).toEqual(DEFAULT_CONFIG.weeklyRoutine[4])
    expect(merged.weeklyRoutine[5]).toEqual(DEFAULT_CONFIG.weeklyRoutine[5])
    expect(merged.weeklyRoutine[6]).toEqual(DEFAULT_CONFIG.weeklyRoutine[6])
  })

  it('un dia de entreno con routineId invalido tambien se repara', () => {
    const week = DEFAULT_CONFIG.weeklyRoutine.map((d, i) =>
      i === 1 ? { kind: 'training', routineId: 'diaX', title: '', note: '' } : d,
    )
    const merged = mergeConfig({ weeklyRoutine: week })
    expect(merged.weeklyRoutine[1]).toEqual(DEFAULT_CONFIG.weeklyRoutine[1])
  })

  it('weeklyRoutine ausente o con forma invalida repara la semana entera', () => {
    expect(mergeConfig({ weeklyRoutine: undefined }).weeklyRoutine).toEqual(DEFAULT_CONFIG.weeklyRoutine)
    expect(mergeConfig({ weeklyRoutine: 'no-es-un-arreglo' }).weeklyRoutine).toEqual(DEFAULT_CONFIG.weeklyRoutine)
  })

  it('stored undefined devuelve la config por defecto completa', () => {
    expect(mergeConfig(undefined)).toEqual(DEFAULT_CONFIG)
  })

  it('stored null devuelve la config por defecto completa', () => {
    expect(mergeConfig(null)).toEqual(DEFAULT_CONFIG)
  })

  it('stored que no es un objeto no revienta y devuelve la config por defecto', () => {
    expect(mergeConfig('no-es-config')).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig(42)).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig([])).toEqual(DEFAULT_CONFIG)
  })

  it('conserva un valor guardado valido sin tocarlo', () => {
    const stored: Config = {
      ...DEFAULT_CONFIG,
      heightCm: 190,
      goal: { ...DEFAULT_CONFIG.goal, weight: 80 },
    }
    const merged = mergeConfig(stored)
    expect(merged).toEqual(stored)
  })

  it('es idempotente, incluido el orden de las claves que store.tsx compara con JSON.stringify', () => {
    const stored = { heightCm: 180, goal: { weight: 70 } }
    const once = mergeConfig(stored)
    const twice = mergeConfig(once)
    expect(twice).toEqual(once)
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('mergeConfig(DEFAULT_CONFIG) es un no-op, tambien en el orden de claves', () => {
    const merged = mergeConfig(DEFAULT_CONFIG)
    expect(merged).toEqual(DEFAULT_CONFIG)
    expect(JSON.stringify(merged)).toBe(JSON.stringify(DEFAULT_CONFIG))
  })
})
