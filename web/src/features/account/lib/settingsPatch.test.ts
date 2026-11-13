// Differential pin: these expected values are what the inline handlers of
// Settings.tsx at base b0d06b4 saved for the same inputs.
import { describe, expect, it } from 'vitest'
import { mergeConfig, MEASUREMENT_KEYS } from '../../../lib/plan'
import { blockEndPatch, blockStartPatch, goalPatch, heightPatch, poolLengthPatch } from './settingsPatch'

const config = mergeConfig({})

describe('heightPatch', () => {
  it('saves a numeric height above 100', () => {
    expect(heightPatch(config, '172.5')).toEqual({ ...config, heightCm: 172.5 })
  })
  it('rejects 100, below, empty-as-zero and non-numeric input', () => {
    for (const raw of ['100', '99', '', 'abc', '-5']) expect(heightPatch(config, raw)).toBeNull()
  })
})

describe('poolLengthPatch', () => {
  it('saves a positive length', () => {
    expect(poolLengthPatch(config, '50')).toEqual({ ...config, poolLengthM: 50 })
    expect(poolLengthPatch(config, '0.5')).toEqual({ ...config, poolLengthM: 0.5 })
  })
  it('rejects zero, negative and non-numeric input', () => {
    for (const raw of ['0', '', '-25', 'x']) expect(poolLengthPatch(config, raw)).toBeNull()
  })
})

describe('goalPatch', () => {
  it('saves each goal key without touching the others', () => {
    for (const k of MEASUREMENT_KEYS) {
      const out = goalPatch(config, k, '12.3')
      expect(out).toEqual({ ...config, goal: { ...config.goal, [k]: 12.3 } })
    }
  })
  it('accepts zero and negatives (as before) but rejects non-numeric input', () => {
    const k = MEASUREMENT_KEYS[0]
    expect(goalPatch(config, k, '0')).toEqual({ ...config, goal: { ...config.goal, [k]: 0 } })
    expect(goalPatch(config, k, 'abc')).toBeNull()
  })
})

describe('block date patches', () => {
  it('save the value as typed', () => {
    expect(blockStartPatch(config, '2026-12-01')).toEqual({ ...config, blockStart: '2026-12-01' })
    expect(blockEndPatch(config, '2027-02-01')).toEqual({ ...config, blockEnd: '2027-02-01' })
    expect(blockStartPatch(config, '').blockStart).toBe('')
  })
})
