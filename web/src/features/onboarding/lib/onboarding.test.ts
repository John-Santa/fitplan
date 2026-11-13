import { describe, expect, it } from 'vitest'
import { blockEndFor, buildOnboarding, initialAnswers, nextMonday, stepError, welcomeSteps, type OnboardingAnswers } from './onboarding'
import { BASELINE, DEFAULT_CONFIG, mergeConfig, UNSET_GOAL } from '../../../lib/plan'
import { BACK_CARE_PLAN_ID, DEFAULT_PLAN, GENERIC_PLAN, defaultPlanWithLegacy } from '../../../lib/defaultPlan'
import { normalizePlan } from '../../../lib/planStorage'

// Thursday 2026-11-12 (the audit date), local time.
const TODAY = new Date(2026, 10, 12)

const answers = (over: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  ...initialAnswers(TODAY),
  height: '168',
  ...over,
})

describe('block start and length', () => {
  it('defaults the start to the following Monday', () => {
    expect(nextMonday(TODAY)).toBe('2026-11-16')
    // On a Monday the default is the next one, not today.
    expect(nextMonday(new Date(2026, 10, 16))).toBe('2026-11-23')
    expect(initialAnswers(TODAY).blockStart).toBe('2026-11-16')
  })

  it('12 weeks end on the Sunday of week 12', () => {
    expect(blockEndFor('2026-11-16', 12)).toBe('2027-02-07')
    expect(blockEndFor('2026-12-07', 12)).toBe('2027-02-28')
  })
})

describe('steps', () => {
  it('follows the welcome order and only invites to an account when login exists', () => {
    expect(welcomeSteps(true)).toEqual(['welcome', 'profile', 'measures', 'block', 'template', 'account'])
    expect(welcomeSteps(false)).toEqual(['welcome', 'profile', 'measures', 'block', 'template'])
  })

  it('requires the height', () => {
    expect(stepError('profile', answers({ height: '' }))).toMatch(/estatura/)
    expect(stepError('profile', answers({ height: '40' }))).toMatch(/estatura/)
    expect(stepError('profile', answers({ height: '172,5' }))).toBeNull()
  })

  it('measures are optional, but saved ones need the weight', () => {
    expect(stepError('measures', answers())).toBeNull()
    expect(stepError('measures', answers({ measures: { waist: '90' } }))).toMatch(/peso/)
    expect(stepError('measures', answers({ measures: { weight: '80', waist: '90' } }))).toBeNull()
  })

  it('the block needs a real start date', () => {
    expect(stepError('block', answers({ blockStart: '' }))).toMatch(/fecha/)
    expect(stepError('block', answers({ blockStart: '2026-02-30' }))).toMatch(/fecha/)
  })
})

describe('what the welcome saves', () => {
  it('skipping the optional steps saves no measurement and no fixed goals', () => {
    const out = buildOnboarding(answers(), TODAY)
    expect(out.measurement).toBeNull()
    expect(out.config.heightCm).toBe(168)
    expect(Object.values(out.config.goal).every(v => v === UNSET_GOAL)).toBe(true)
    expect(out.config.goal).not.toEqual(DEFAULT_CONFIG.goal)
  })

  it('never includes the seeded 2026-08-03 measurement', () => {
    const out = buildOnboarding(answers({ measures: { weight: '83' } }), TODAY)
    expect(out.measurement?.date).not.toBe(BASELINE.date)
  })

  it('saves the entered measures dated today and the entered goals', () => {
    const out = buildOnboarding(answers({
      goals: { weight: '70', waist: '85,5' },
      measures: { weight: '78,4', fatPct: '25', neck: '' },
    }), TODAY)
    expect(out.measurement).toEqual({ date: '2026-11-12', weight: 78.4, fatPct: 25 })
    expect(out.config.goal.weight).toBe(70)
    expect(out.config.goal.waist).toBe(85.5)
    expect(out.config.goal.muscle).toBe(UNSET_GOAL)
  })

  it('the block starts on the chosen date and lasts the plan weeks', () => {
    const out = buildOnboarding(answers({ blockStart: '2026-12-07' }), TODAY)
    expect(out.config.blockStart).toBe('2026-12-07')
    expect(out.config.blockEnd).toBe('2027-02-28')
  })

  it('"espalda protegida" is the same plan the first open used to seed', () => {
    const out = buildOnboarding(answers({ template: BACK_CARE_PLAN_ID }), TODAY)
    expect(out.plan).toEqual(defaultPlanWithLegacy())
    expect(out.config.weeklyRoutine).toEqual(DEFAULT_PLAN.weekTemplate)
  })

  it('the general template brings its own plan and week', () => {
    const out = buildOnboarding(answers({ template: 'general' }), TODAY)
    expect(out.plan.id).toBe('general')
    expect(out.plan).toEqual(GENERIC_PLAN)
    expect(out.config.weeklyRoutine).toEqual(GENERIC_PLAN.weekTemplate)
  })

  it('writes a config and plan that read back unchanged', () => {
    for (const template of [BACK_CARE_PLAN_ID, 'general'] as const) {
      const out = buildOnboarding(answers({ template, goals: { weight: '70' } }), TODAY)
      expect(mergeConfig(JSON.parse(JSON.stringify(out.config)))).toEqual(out.config)
      expect(normalizePlan(JSON.parse(JSON.stringify(out.plan)))).toEqual(out.plan)
    }
  })
})
