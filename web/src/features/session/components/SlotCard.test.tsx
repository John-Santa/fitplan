// completionPatch is what "Completar serie" and "Completar ejercicio" log; refFor
// is the previous-session reference for a set index. The render tests check what
// the set card says and prefills for today's suggested load.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Phase, PlanSlot, SetLog, StrengthSession } from '../../../lib/types'
import { DEFAULT_PLAN } from '../../../lib/defaultPlan'
import { phaseForWeek } from '../../../lib/phases'
import SlotCard, { completionPatch, refFor, suggestionFor, type SlotCardProps } from './SlotCard'

const slot = (target: PlanSlot['target']): PlanSlot => ({ id: 's1', exerciseId: 'squat', sets: 3, target, restSec: 60, note: '' })
const reps = slot({ kind: 'reps', low: 10, high: 12 })
const log = (weight: number | null, reps: number | null): SetLog => ({ exerciseId: 'squat', setIndex: 0, weight, reps, done: false })

describe('completionPatch', () => {
  it('logs typed weight and reps for a reps target', () => {
    expect(completionPatch(reps, log(55, 9), log(60, 10))).toEqual({ done: true, weight: 55, reps: 9 })
  })

  it('falls back to the previous session weight and the top of the range when nothing was typed', () => {
    expect(completionPatch(reps, undefined, log(60, 10))).toEqual({ done: true, weight: 60, reps: 12 })
  })

  it('logs no weight when there is neither a typed weight nor a reference', () => {
    expect(completionPatch(reps, undefined, undefined)).toEqual({ done: true, weight: null, reps: 12 })
  })

  it('logs the typed or minimum seconds for a time target', () => {
    const t = slot({ kind: 'time', lowSec: 20, highSec: 30 })
    expect(completionPatch(t, undefined, undefined)).toEqual({ done: true, durationSec: 20 })
    expect(completionPatch(t, { ...log(null, null), durationSec: 28 }, undefined)).toEqual({ done: true, durationSec: 28 })
  })

  it('logs the target metres for a distance target and only done for a note', () => {
    expect(completionPatch(slot({ kind: 'distance', meters: 30 }), undefined, undefined)).toEqual({ done: true, distanceM: 30 })
    expect(completionPatch(slot({ kind: 'note' }), undefined, undefined)).toEqual({ done: true })
  })
})

describe('completionPatch with a suggested weight', () => {
  it('logs the suggested weight when nothing was typed', () => {
    expect(completionPatch(reps, undefined, log(60, 12), 62.5)).toEqual({ done: true, weight: 62.5, reps: 12 })
  })

  it('lets a typed weight win over the suggestion', () => {
    expect(completionPatch(reps, log(55, 9), log(60, 12), 62.5)).toEqual({ done: true, weight: 55, reps: 9 })
  })

  it('leaves time, distance and note targets unchanged', () => {
    expect(completionPatch(slot({ kind: 'time', lowSec: 20, highSec: 30 }), undefined, undefined, 62.5)).toEqual({ done: true, durationSec: 20 })
    expect(completionPatch(slot({ kind: 'distance', meters: 30 }), undefined, undefined, 62.5)).toEqual({ done: true, distanceM: 30 })
    expect(completionPatch(slot({ kind: 'note' }), undefined, undefined, 62.5)).toEqual({ done: true })
  })
})

describe('refFor', () => {
  const prev = { session: {} as never, sets: [log(60, 12), { ...log(62.5, 10), setIndex: 1 }] }

  it('returns the previous set at the same index and falls back to the last set', () => {
    expect(refFor(prev, 1)?.weight).toBe(62.5)
    expect(refFor(prev, 5)?.weight).toBe(62.5)
    expect(refFor(null, 0)).toBeUndefined()
  })
})

const base = phaseForWeek(DEFAULT_PLAN, 4) as Phase
const deload = phaseForWeek(DEFAULT_PLAN, 7) as Phase
const prevOf = (weight: number, repCount: number, n = 3) => ({
  session: {} as StrengthSession,
  sets: Array.from({ length: n }, (_, i): SetLog => ({ exerciseId: 'squat', setIndex: i, weight, reps: repCount, done: true })),
})

describe('suggestionFor', () => {
  it('is null without a previous session and follows the phase otherwise', () => {
    expect(suggestionFor(null, 0, reps, 3, base)).toBeNull()
    expect(suggestionFor(prevOf(60, 12), 0, reps, 3, base)?.weight).toBe(62.5)
    expect(suggestionFor(prevOf(60, 12), 0, reps, 3, deload)?.weight).toBe(30)
  })
})

function render(over: Partial<SlotCardProps> = {}): string {
  const props: SlotCardProps = {
    slot: reps, name: 'Sentadilla', sets: 3, logs: [], prev: prevOf(60, 10), seat: '', pain: undefined,
    current: 0, skipped: new Set(), phase: base,
    onUpdate: () => {}, onPain: () => {}, onInfo: () => {}, onSeat: () => {},
    ...over,
  }
  return renderToString(<SlotCard {...props} />).replace(/<!-- -->/g, '')
}
const weightInput = (html: string) => /aria-label="Peso"[^>]*value="([^"]*)"|value="([^"]*)"[^>]*aria-label="Peso"/.exec(html)

describe('SlotCard previous session and suggested load', () => {
  it('shows what was done last time and the same-weight suggestion', () => {
    const html = render()
    expect(html).toContain('La vez pasada: 60 kg × 10')
    expect(html).toContain('Sugerido hoy: 60 kg · Mismo peso, suma repeticiones')
    expect(html).not.toContain('Anterior:')
    expect(html).not.toContain('Sube peso')
  })

  it('suggests one plate more and the pill, the line and the stepper agree', () => {
    const html = render({ prev: prevOf(60, 12) })
    expect(html).toContain('La vez pasada: 60 kg × 12')
    expect(html).toContain('Sugerido hoy: 62,5 kg · Sube una placa')
    expect(html).toContain('Sube peso hoy')
    expect(html).not.toContain('Sube peso la próxima')
    expect(html).toContain('Cerraste las tres series en 12. Hoy va la siguiente placa.')
    expect(weightInput(html)?.[1] ?? weightInput(html)?.[2]).toBe('62.5')
  })

  it('halves the load in the deload week and does not also say it is time to go up', () => {
    const html = render({ prev: prevOf(60, 12), phase: deload })
    expect(html).toContain('Sugerido hoy: 30 kg · Semana de descarga: la mitad de peso')
    expect(html).not.toContain('Sube peso hoy')
    expect(html).not.toContain('Hoy va la siguiente placa')
    expect(weightInput(html)?.[1] ?? weightInput(html)?.[2]).toBe('30')
  })

  it('keeps a value the user already typed over the suggestion', () => {
    const html = render({ prev: prevOf(60, 12), logs: [{ ...log(55, null), setIndex: 0 }] })
    expect(weightInput(html)?.[1] ?? weightInput(html)?.[2]).toBe('55')
  })

  it('keeps the first-time message with no suggestion', () => {
    const html = render({ prev: null })
    expect(html).toContain('Primera vez: empieza liviano, la primera serie es de reconocimiento.')
    expect(html).not.toContain('Sugerido hoy')
    expect(html).not.toContain('La vez pasada')
  })

  it('suggests per set index and shows it on the pending rows of the log', () => {
    const prev = { session: {} as StrengthSession, sets: [60, 65, 70].map((w, i): SetLog => ({ exerciseId: 'squat', setIndex: i, weight: w, reps: 10, done: true })) }
    const html = render({ prev, current: 1, logs: [{ exerciseId: 'squat', setIndex: 0, weight: 60, reps: 10, done: true }] })
    expect(html).toContain('La vez pasada: 65 kg × 10')
    expect(html).toContain('Sugerido hoy: 65 kg')
    expect(html).toContain('70 kg × 12')
  })

  it('gives no suggestion to time targets', () => {
    const html = render({ slot: slot({ kind: 'time', lowSec: 20, highSec: 30 }) })
    expect(html).not.toContain('Sugerido hoy')
    expect(html).not.toContain('La vez pasada')
  })
})
