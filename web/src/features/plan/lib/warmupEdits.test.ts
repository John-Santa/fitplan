// The warm-up is edited with the same pure helpers as a routine's exercises:
// warmupView exposes it as a one-block routine and applyWarmupView folds the
// edited result back into plan.warmup.
import { describe, expect, it } from 'vitest'
import type { TrainingPlan } from '../../../lib/types'
import { DEFAULT_PLAN } from '../../../lib/defaultPlan'
import {
  addCustomExercise, addSlot, moveSlot, removeSlot, resetToTemplate, swapExercise, updateSlot,
} from '../../../lib/planEdits'
import { normalizePlan } from '../../../lib/planStorage'
import { WARMUP_ROUTINE_ID, applyWarmupView, resetPlanToTemplate, warmupView } from './warmupEdits'

const base = (): TrainingPlan => structuredClone(DEFAULT_PLAN)
const ids = (p: TrainingPlan) => p.warmup.slots.map(s => s.id)

/** Runs one planEdits operation over the warm-up, the way the editor does. */
function edit(plan: TrainingPlan, fn: (view: TrainingPlan, blockId: string) => TrainingPlan): TrainingPlan {
  const view = warmupView(plan)
  const routine = view.routines.find(r => r.id === WARMUP_ROUTINE_ID)!
  return applyWarmupView(plan, fn(view, routine.blocks[0].id))
}

describe('warmupView', () => {
  it('exposes the warm-up as a one-block routine next to the real routines', () => {
    const p = base()
    const view = warmupView(p)
    const r = view.routines.find(x => x.id === WARMUP_ROUTINE_ID)!
    expect(r.blocks).toEqual([p.warmup])
    expect(view.routines.slice(0, p.routines.length)).toEqual(p.routines)
  })

  it('applying an untouched view returns the same plan object', () => {
    const p = base()
    expect(applyWarmupView(p, warmupView(p))).toBe(p)
  })

  it('never leaks the virtual routine into the plan', () => {
    const p = base()
    const next = edit(p, (v, b) => removeSlot(v, WARMUP_ROUTINE_ID, b, 'warmup-1'))
    expect(next.routines).toEqual(p.routines)
  })
})

describe('add, remove and reorder warm-up exercises', () => {
  it('adds an exercise from the library at the end with the category defaults', () => {
    const p = base()
    const next = edit(p, (v, b) => addSlot(v, WARMUP_ROUTINE_ID, b, 'child-pose'))
    expect(next.warmup.slots).toHaveLength(p.warmup.slots.length + 1)
    const added = next.warmup.slots.at(-1)!
    expect(added.exerciseId).toBe('child-pose')
    expect(new Set(ids(next)).size).toBe(ids(next).length)
    expect(next.routines).toEqual(p.routines)
  })

  it('does not add an exercise that is already in the warm-up', () => {
    const p = base()
    const next = edit(p, (v, b) => addSlot(v, WARMUP_ROUTINE_ID, b, 'bird-dog'))
    expect(next).toBe(p)
  })

  it('removes an exercise', () => {
    const p = base()
    const next = edit(p, (v, b) => removeSlot(v, WARMUP_ROUTINE_ID, b, 'warmup-2'))
    expect(ids(next)).toEqual(['warmup-1', 'warmup-3', 'warmup-4', 'warmup-5', 'warmup-6', 'warmup-7'])
  })

  it('can empty the warm-up completely', () => {
    let p = base()
    for (const id of ids(p)) p = edit(p, (v, b) => removeSlot(v, WARMUP_ROUTINE_ID, b, id))
    expect(p.warmup.slots).toEqual([])
  })

  it('moves an exercise up and down', () => {
    const p = base()
    const up = edit(p, (v, b) => moveSlot(v, WARMUP_ROUTINE_ID, b, 'warmup-3', -1))
    expect(ids(up).slice(0, 3)).toEqual(['warmup-1', 'warmup-3', 'warmup-2'])
    const down = edit(up, (v, b) => moveSlot(v, WARMUP_ROUTINE_ID, b, 'warmup-3', 1))
    expect(ids(down)).toEqual(ids(p))
  })

  it('edits sets, target, rest and note of a warm-up exercise', () => {
    const p = base()
    const next = edit(p, (v, b) => updateSlot(v, WARMUP_ROUTINE_ID, b, 'warmup-2', {
      sets: 2, target: { kind: 'reps', low: 10, high: 12 }, restSec: 15, note: 'Suave',
    }).plan)
    const slot = next.warmup.slots.find(s => s.id === 'warmup-2')!
    expect(slot).toMatchObject({ sets: 2, target: { kind: 'reps', low: 10, high: 12 }, restSec: 15, note: 'Suave' })
  })

  it('swapping the exercise drops the note that described the old one', () => {
    const p = base()
    const next = edit(p, (v, b) => swapExercise(v, WARMUP_ROUTINE_ID, b, 'warmup-2', 'child-pose'))
    const slot = next.warmup.slots.find(s => s.id === 'warmup-2')!
    expect(slot.exerciseId).toBe('child-pose')
    expect(slot.note).toBe('')
    expect(slot.target).toEqual(p.warmup.slots[1].target)
  })

  it('keeps a custom exercise created while editing the warm-up', () => {
    const p = base()
    const next = edit(p, (v, b) => {
      const withCustom = addCustomExercise(v, { name: 'Círculos de brazo', category: 'mobility', primaryMuscles: ['Hombros'] })
      return addSlot(withCustom, WARMUP_ROUTINE_ID, b, withCustom.customExercises.at(-1)!.id)
    })
    expect(next.customExercises).toHaveLength(1)
    expect(next.warmup.slots.at(-1)!.exerciseId).toBe(next.customExercises[0].id)
  })
})

describe('resetPlanToTemplate', () => {
  it('restores the warm-up from the template', () => {
    let p = edit(base(), (v, b) => removeSlot(v, WARMUP_ROUTINE_ID, b, 'warmup-1'))
    p = edit(p, (v, b) => addSlot(v, WARMUP_ROUTINE_ID, b, 'child-pose'))
    const reset = resetPlanToTemplate(p)
    expect(reset.warmup).toEqual(DEFAULT_PLAN.warmup)
    expect(reset.warmup).not.toBe(DEFAULT_PLAN.warmup)
  })

  it('resets routines exactly like resetToTemplate and keeps custom ones and exercises', () => {
    let p = base()
    p = { ...p, routines: [...p.routines, { ...p.routines[0], id: 'mine', name: 'Mía' }] }
    p = addCustomExercise(p, { name: 'Propio', category: 'core', primaryMuscles: [] })
    const reset = resetPlanToTemplate(p)
    expect(reset.routines).toEqual(resetToTemplate(p).routines)
    expect(reset.routines.some(r => r.id === 'mine')).toBe(true)
    expect(reset.customExercises).toEqual(p.customExercises)
  })

  it('does not mutate the template', () => {
    const snap = structuredClone(DEFAULT_PLAN)
    const reset = resetPlanToTemplate(base())
    reset.warmup.slots[0].note = 'changed'
    expect(DEFAULT_PLAN).toEqual(snap)
  })
})

describe('persisted shape', () => {
  it('an edited warm-up survives normalizePlan after JSON', () => {
    let p = edit(base(), (v, b) => addSlot(v, WARMUP_ROUTINE_ID, b, 'child-pose'))
    p = edit(p, (v, b) => moveSlot(v, WARMUP_ROUTINE_ID, b, 'warmup-4', -1))
    expect(normalizePlan(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('an emptied warm-up survives normalizePlan', () => {
    const p = { ...base(), warmup: { ...DEFAULT_PLAN.warmup, slots: [] } }
    expect(normalizePlan(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })

  it('a plan stored before warm-up editing (no customExercises, template warm-up) still loads unchanged', () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_PLAN)) as Record<string, unknown>
    delete old.customExercises
    const loaded = normalizePlan(old)
    expect(loaded).toEqual(DEFAULT_PLAN)
    expect(loaded!.warmup).toEqual(DEFAULT_PLAN.warmup)
  })
})
