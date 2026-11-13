// Pure rules of the three-way config merge that the multi-device engine
// tests (configSync.test.ts) do not reach.
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import type { Config } from '../../../lib/types'
import { mergeConfigs, rebaseConfigEdit } from './configMerge'

const side = (config: Config, updatedAt: number) => ({ config, updatedAt })

describe('mergeConfigs', () => {
  it('keeps the block dates as one pair: a conflict never mixes a start from one device with an end from the other', () => {
    const base = DEFAULT_CONFIG
    const local = { ...base, blockStart: '2027-02-08', blockEnd: '2027-05-02' }
    const remote = { ...base, blockEnd: '2027-02-14' }
    const { merged, discarded } = mergeConfigs(base, side(local, 1), side(remote, 2))
    expect([merged.blockStart, merged.blockEnd]).toEqual([base.blockStart, '2027-02-14'])
    expect(discarded).toEqual(['Fechas del bloque'])
  })

  it('without a base, a weekday intention set on one side and empty on the other is kept', () => {
    const withIntention = (i: number, time: string, place: string): Config => ({
      ...DEFAULT_CONFIG,
      intentions: DEFAULT_CONFIG.intentions.map((x, j) => (j === i ? { time, place } : x)) as unknown as Config['intentions'],
    })
    const { merged, discarded } = mergeConfigs(null, side(withIntention(1, '07:00', 'Gimnasio'), 1), side(withIntention(3, '20:00', 'Piscina'), 2))
    expect(merged.intentions[1]).toEqual({ time: '07:00', place: 'Gimnasio' })
    expect(merged.intentions[3]).toEqual({ time: '20:00', place: 'Piscina' })
    expect(discarded).toEqual([])
  })

  it('names a lost goal field and a lost weekday plan for the notice', () => {
    const base = DEFAULT_CONFIG
    const local = { ...base, goal: { ...base.goal, weight: 75 }, weeklyRoutine: base.weeklyRoutine.map((d, i) => (i === 1 ? { ...d, note: 'local' } : d)) as unknown as Config['weeklyRoutine'] }
    const remote = { ...base, goal: { ...base.goal, weight: 74 }, weeklyRoutine: base.weeklyRoutine.map((d, i) => (i === 1 ? { ...d, note: 'remote' } : d)) as unknown as Config['weeklyRoutine'] }
    const { merged, discarded } = mergeConfigs(base, side(local, 1), side(remote, 2))
    expect(merged.goal.weight).toBe(74)
    expect(merged.weeklyRoutine[1].note).toBe('remote')
    expect(discarded).toEqual(['Meta de peso', 'Plan del lunes'])
  })
})

describe('rebaseConfigEdit', () => {
  it('with nothing merged meanwhile, saves exactly the edit', () => {
    const edited = { ...DEFAULT_CONFIG, heightCm: 180, habitCheckIns: ['2026-11-10'] }
    expect(rebaseConfigEdit(DEFAULT_CONFIG, edited, DEFAULT_CONFIG)).toEqual(edited)
  })
})
