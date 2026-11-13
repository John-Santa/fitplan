// Pure rules of the three-way config merge that the multi-device engine
// tests (configSync.test.ts) do not reach.
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, mergeConfig } from '../../../lib/plan'
import type { Config } from '../../../lib/types'
import { configConflictText, mergeConfigs, rebaseConfigEdit } from './configMerge'

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

  it('saves a discipline list edit over a config another device changed meanwhile', () => {
    const edited = { ...DEFAULT_CONFIG, disciplines: ['strength', 'swim'] as Config['disciplines'] }
    const current = { ...DEFAULT_CONFIG, heightCm: 180 }
    const saved = rebaseConfigEdit(DEFAULT_CONFIG, edited, current)
    expect(saved.disciplines).toEqual(['strength', 'swim'])
    expect(saved.heightCm).toBe(180)
  })
})

// S1/S6/S10: the new flat fields merge as scalars, with Spanish labels, and a
// body from an older client (which drops them) never undoes a local value.
describe('mergeConfigs: disciplines and swimWeeklyTarget', () => {
  /** A config as an older client writes it: without the new fields. */
  const older = (patch: Partial<Config> = {}) => {
    const c = structuredClone({ ...DEFAULT_CONFIG, ...patch }) as Partial<Config>
    delete c.disciplines
    delete c.swimWeeklyTarget
    return c
  }

  it('names a lost discipline list "Tus disciplinas"', () => {
    const base = DEFAULT_CONFIG
    const local = { ...base, disciplines: ['strength', 'swim'] as Config['disciplines'] }
    const remote = { ...base, disciplines: ['swim'] as Config['disciplines'] }
    const { merged, discarded } = mergeConfigs(base, side(local, 1), side(remote, 2))
    expect(merged.disciplines).toEqual(['swim'])
    expect(discarded).toEqual(['Tus disciplinas'])
    expect(configConflictText(discarded)).toBe('Tus disciplinas: esto cambió en otro dispositivo y se conservó esa versión.')
  })

  it('names a lost swim target "Sesiones de natación por semana"', () => {
    const base = DEFAULT_CONFIG
    const { merged, discarded, remoteDiscarded } = mergeConfigs(
      base,
      side({ ...base, swimWeeklyTarget: 3 }, 2),
      side({ ...base, swimWeeklyTarget: 4 }, 1),
    )
    expect(merged.swimWeeklyTarget).toBe(3)
    expect(discarded).toEqual([])
    expect(remoteDiscarded).toEqual(['Sesiones de natación por semana'])
  })

  it('an older-client body keeps the local disciplines and target, with no conflict notice', () => {
    // The base is what the server and this device last agreed on, stored as
    // mergeConfig of a body from before this build (configSync.noteConfigSynced).
    const base = mergeConfig(older())
    const local = { ...base, disciplines: ['strength', 'swim'] as Config['disciplines'], swimWeeklyTarget: 3 }
    // The older device changed its height after; its body has no new fields.
    const remote = mergeConfig(older({ heightCm: 180 }))
    for (const [l, r] of [[1, 2], [2, 1]]) {
      const { merged, discarded, remoteDiscarded } = mergeConfigs(base, side(local, l), side(remote, r))
      expect(merged.disciplines).toEqual(['strength', 'swim'])
      expect(merged.swimWeeklyTarget).toBe(3)
      expect(merged.heightCm).toBe(180)
      expect(discarded).toEqual([])
      expect(remoteDiscarded).toEqual([])
    }
  })

  it('two older-client sides merge exactly as before the new fields existed', () => {
    const base = mergeConfig(older())
    const { merged, discarded } = mergeConfigs(base, side(mergeConfig(older({ heightCm: 170 })), 1), side(mergeConfig(older({ heightCm: 180 })), 2))
    expect(merged.heightCm).toBe(180)
    expect(discarded).toEqual(['Altura'])
    expect(merged.disciplines).toEqual(['strength'])
    expect(merged.swimWeeklyTarget).toBe(2)
  })

  it('a config of this build, without the new fields as an older client reads it, is still a valid config', () => {
    const ours = mergeConfig({ ...DEFAULT_CONFIG, heightCm: 181, disciplines: ['swim'], swimWeeklyTarget: 5 })
    const asOlder = older(ours)
    const back = mergeConfig(asOlder) as Partial<Config>
    expect(back.heightCm).toBe(181)
    delete back.disciplines
    delete back.swimWeeklyTarget
    expect(back).toEqual(asOlder)
  })
})
