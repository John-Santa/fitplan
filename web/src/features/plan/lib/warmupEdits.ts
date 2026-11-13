// The warm-up block lives in plan.warmup, not in a routine. To edit it with the
// same helpers as a routine's exercises (addSlot, moveSlot, updateSlot, ...)
// the editor works on a "view": the plan plus a virtual one-block routine that
// holds the warm-up. applyWarmupView folds the edited block back and drops the
// virtual routine, so the persisted plan shape does not change.
import type { PlanRoutine, TrainingPlan } from '../../../lib/types'
import { DEFAULT_PLAN } from '../../../lib/defaultPlan'
import { resetToTemplate } from '../../../lib/planEdits'

export const WARMUP_ROUTINE_ID = 'warmup'

export function warmupView(plan: TrainingPlan): TrainingPlan {
  const routine: PlanRoutine = {
    id: WARMUP_ROUTINE_ID,
    name: plan.warmup.title,
    focus: '',
    intro: '',
    duration: '',
    warmup: false,
    blocks: [plan.warmup],
  }
  return { ...plan, routines: [...plan.routines, routine] }
}

/** The session shows a warm-up item's note as its text, so a note written for
 *  the previous exercise must not outlive a swap. */
function dropStaleNotes(prev: TrainingPlan['warmup'], next: TrainingPlan['warmup']): TrainingPlan['warmup'] {
  const before = new Map(prev.slots.map(s => [s.id, s.exerciseId]))
  if (!next.slots.some(s => before.has(s.id) && before.get(s.id) !== s.exerciseId)) return next
  return {
    ...next,
    slots: next.slots.map(s => (before.has(s.id) && before.get(s.id) !== s.exerciseId ? { ...s, note: '' } : s)),
  }
}

/** `edited` is a view obtained from warmupView(prev) after one or more edits. */
export function applyWarmupView(prev: TrainingPlan, edited: TrainingPlan): TrainingPlan {
  const view = edited.routines.find(r => r.id === WARMUP_ROUTINE_ID)
  if (!view) return prev
  const warmup = dropStaleNotes(prev.warmup, view.blocks[0] ?? prev.warmup)
  if (warmup === prev.warmup && edited.customExercises === prev.customExercises) return prev
  return { ...prev, warmup, customExercises: edited.customExercises }
}

/** Restores the template routines (see resetToTemplate) and its warm-up. */
export function resetPlanToTemplate(plan: TrainingPlan, template: TrainingPlan = DEFAULT_PLAN): TrainingPlan {
  return { ...resetToTemplate(plan, template), warmup: structuredClone(template.warmup) }
}
