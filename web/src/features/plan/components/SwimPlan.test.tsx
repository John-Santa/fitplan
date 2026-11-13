import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import SwimPlan, { poolLengthUpdate, stepSwimTarget } from './SwimPlan'

const render = () =>
  renderToString(<SwimPlan config={DEFAULT_CONFIG} saveConfig={async () => {}} />).replace(/<!-- -->/g, '')

describe('SwimPlan', () => {
  it('renders the title, the weekly target and the pool length', () => {
    const html = render()
    expect(html).toContain('Tu plan de natación')
    expect(html).toContain('Sesiones por semana')
    expect(html).toContain('Largo de la piscina (m)')
    expect(html).toContain(`>${DEFAULT_CONFIG.swimWeeklyTarget}<`)
  })
})

describe('stepSwimTarget', () => {
  it('saves the target moved by one', () => {
    expect(stepSwimTarget({ ...DEFAULT_CONFIG, swimWeeklyTarget: 2 }, 1)).toEqual({ ...DEFAULT_CONFIG, swimWeeklyTarget: 3 })
    expect(stepSwimTarget({ ...DEFAULT_CONFIG, swimWeeklyTarget: 2 }, -1)).toEqual({ ...DEFAULT_CONFIG, swimWeeklyTarget: 1 })
  })

  it('stays within 1-7 and saves nothing outside', () => {
    expect(stepSwimTarget({ ...DEFAULT_CONFIG, swimWeeklyTarget: 1 }, -1)).toBeNull()
    expect(stepSwimTarget({ ...DEFAULT_CONFIG, swimWeeklyTarget: 7 }, 1)).toBeNull()
  })
})

describe('poolLengthUpdate', () => {
  it('accepts a positive number, like Settings', () => {
    expect(poolLengthUpdate(DEFAULT_CONFIG, '50')).toEqual({ ...DEFAULT_CONFIG, poolLengthM: 50 })
  })

  it('rejects zero, negatives and non-numbers', () => {
    expect(poolLengthUpdate(DEFAULT_CONFIG, '0')).toBeNull()
    expect(poolLengthUpdate(DEFAULT_CONFIG, '-5')).toBeNull()
    expect(poolLengthUpdate(DEFAULT_CONFIG, 'abc')).toBeNull()
  })
})
