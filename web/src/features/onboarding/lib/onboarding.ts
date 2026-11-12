// Welcome (F1): the answers a new install collects and what they become.
// Pure: the component keeps the answers as typed text and only turns them
// into a config, a plan and an optional measurement when the welcome ends.
import type { Config, Measurement, TrainingPlan } from '../../../lib/types'
import { todayISO } from '../../../lib/calc'
import { MEASUREMENT_KEYS, newInstallConfig } from '../../../lib/plan'
import { BACK_CARE_PLAN_ID, templatePlan, type PlanTemplateId } from '../../../lib/defaultPlan'

export type GoalKey = keyof Config['goal']

export interface OnboardingAnswers {
  /** Typed text, as the inputs hold it ("172,5" is valid). */
  height: string
  goals: Partial<Record<GoalKey, string>>
  /** Current measures, all optional. */
  measures: Partial<Record<GoalKey, string>>
  blockStart: string
  template: PlanTemplateId
}

export type WelcomeStep = 'welcome' | 'profile' | 'measures' | 'block' | 'template' | 'account'

/** Steps in order. The account invitation only exists with login enabled. */
export function welcomeSteps(withAccount: boolean): WelcomeStep[] {
  const steps: WelcomeStep[] = ['welcome', 'profile', 'measures', 'block', 'template']
  return withAccount ? [...steps, 'account'] : steps
}

/** Weeks of every template the welcome offers (12-week block). */
export const BLOCK_WEEKS = 12

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseISO(iso: string): Date | null {
  const m = ISO_DATE.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null
}

/** The Monday after `today` (a Monday gives the next one). */
export function nextMonday(today: Date): string {
  const daysAhead = ((8 - today.getDay()) % 7) || 7
  return todayISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysAhead))
}

/** Last day of a block of `weeks` weeks starting on `start`. */
export function blockEndFor(start: string, weeks: number): string {
  const d = parseISO(start)
  if (!d) throw new Error(`Invalid block start: ${start}`)
  return todayISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + weeks * 7 - 1))
}

export function initialAnswers(today: Date): OnboardingAnswers {
  return { height: '', goals: {}, measures: {}, blockStart: nextMonday(today), template: BACK_CARE_PLAN_ID }
}

/** Number typed by the person, or undefined when empty or not a number.
 *  Accepts the decimal comma. */
function parseNumber(text: string | undefined): number | undefined {
  if (text == null || text.trim() === '') return undefined
  const n = Number(text.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function hasText(text: string | undefined): boolean {
  return text != null && text.trim() !== ''
}

/** Every filled field must be a positive number. */
function numbersError(fields: Partial<Record<GoalKey, string>>): boolean {
  return MEASUREMENT_KEYS.some(k => hasText(fields[k]) && !((parseNumber(fields[k]) ?? 0) > 0))
}

/** Why the step cannot continue, or null when it can. */
export function stepError(step: WelcomeStep, a: OnboardingAnswers): string | null {
  if (step === 'profile') {
    const h = parseNumber(a.height)
    if (h == null || h < 100 || h > 250) return 'Indica tu estatura en centímetros (entre 100 y 250).'
    if (numbersError(a.goals)) return 'Revisa las metas: usa solo números mayores que cero.'
  }
  if (step === 'measures') {
    if (numbersError(a.measures)) return 'Revisa las medidas: usa solo números mayores que cero.'
    const any = MEASUREMENT_KEYS.some(k => hasText(a.measures[k]))
    if (any && parseNumber(a.measures.weight) == null) return 'Para guardar tus medidas, indica al menos el peso.'
  }
  if (step === 'block' && !parseISO(a.blockStart)) return 'Elige una fecha de inicio válida.'
  return null
}

export interface OnboardingResult {
  config: Config
  plan: TrainingPlan
  /** Only when the person entered their measures: skipping saves nothing. */
  measurement: Measurement | null
}

/** What the welcome saves when it ends. Call only after every step passed
 *  stepError. */
export function buildOnboarding(a: OnboardingAnswers, today: Date): OnboardingResult {
  const plan = templatePlan(a.template)
  const goal: Partial<Config['goal']> = {}
  for (const k of MEASUREMENT_KEYS) {
    const v = parseNumber(a.goals[k])
    if (v != null) goal[k] = v
  }
  const config = newInstallConfig({
    heightCm: parseNumber(a.height) ?? 0,
    goal,
    blockStart: a.blockStart,
    blockEnd: blockEndFor(a.blockStart, plan.weeks),
    weeklyRoutine: plan.weekTemplate,
  })
  const weight = parseNumber(a.measures.weight)
  let measurement: Measurement | null = null
  if (weight != null) {
    const m: Measurement = { date: todayISO(today), weight }
    for (const k of MEASUREMENT_KEYS) {
      if (k === 'weight') continue
      const v = parseNumber(a.measures[k])
      if (v != null) m[k] = v
    }
    measurement = m
  }
  return { config, plan, measurement }
}
