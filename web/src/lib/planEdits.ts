// Operaciones puras de edicion del plan. Cada una devuelve un plan nuevo y
// nunca muta el recibido; cuando no hay nada que cambiar devuelven el mismo
// objeto. El exerciseId es la llave del historial: solo swapExercise lo
// cambia en un slot existente.
import type { ExerciseCategory, PlanRoutine, PlanSlot, RoutineBlock, Target, TrainingPlan } from './types'
import { DEFAULT_PLAN } from './defaultPlan'
import { resolveExercise } from './library'

/* ---------- ids ---------- */

let counter = 0

/** `<prefijo>-<ms en base 36>-<n>`; el contador del modulo evita choques dentro
 *  del mismo milisegundo y `taken` cubre ids ya presentes en el plan. */
function uniqueId(prefix: string, taken: Set<string>): string {
  let id: string
  do {
    counter += 1
    id = `${prefix}-${Date.now().toString(36)}-${counter}`
  } while (taken.has(id))
  return id
}

/* ---------- helpers de reemplazo inmutable ---------- */

type BlockFn = (block: RoutineBlock, routine: PlanRoutine) => RoutineBlock | null
const same = <T,>(a: T, b: T) => a === b

function editRoutine(plan: TrainingPlan, routineId: string, fn: (r: PlanRoutine) => PlanRoutine | null): TrainingPlan {
  const i = plan.routines.findIndex(r => r.id === routineId)
  if (i < 0) return plan
  const next = fn(plan.routines[i])
  if (next === null || same(next, plan.routines[i])) return plan
  const routines = plan.routines.slice()
  routines[i] = next
  return { ...plan, routines }
}

function editBlock(plan: TrainingPlan, routineId: string, blockId: string, fn: BlockFn): TrainingPlan {
  return editRoutine(plan, routineId, r => {
    const i = r.blocks.findIndex(b => b.id === blockId)
    if (i < 0) return null
    const next = fn(r.blocks[i], r)
    if (next === null) return null
    const blocks = r.blocks.slice()
    blocks[i] = next
    return { ...r, blocks }
  })
}

/* ---------- rutinas ---------- */

export function renameRoutine(
  plan: TrainingPlan,
  routineId: string,
  fields: { name?: string; focus?: string; intro?: string; duration?: string },
): TrainingPlan {
  if (fields.name !== undefined && fields.name.trim() === '') return plan
  return editRoutine(plan, routineId, r => ({
    ...r,
    ...(fields.name !== undefined ? { name: fields.name.trim() } : {}),
    ...(fields.focus !== undefined ? { focus: fields.focus.trim() } : {}),
    ...(fields.intro !== undefined ? { intro: fields.intro.trim() } : {}),
    ...(fields.duration !== undefined ? { duration: fields.duration.trim() } : {}),
  }))
}

export function addRoutine(plan: TrainingPlan, name: string): TrainingPlan {
  const taken = new Set(plan.routines.map(r => r.id))
  const id = uniqueId('custom', taken)
  const routine: PlanRoutine = {
    id,
    name: name.trim() || 'Rutina nueva',
    focus: '',
    intro: '',
    duration: '',
    warmup: true,
    blocks: [{ id: `${id}-main`, title: 'Ejercicios', note: '', slots: [] }],
  }
  return { ...plan, routines: [...plan.routines, routine] }
}

/** Archivar nunca borra: el historial conserva nombre y ejercicios. */
export function archiveRoutine(plan: TrainingPlan, routineId: string): TrainingPlan {
  return editRoutine(plan, routineId, r => (r.archived ? null : { ...r, archived: true }))
}

export function restoreRoutine(plan: TrainingPlan, routineId: string): TrainingPlan {
  return editRoutine(plan, routineId, r => {
    if (!r.archived) return null
    const { archived: _archived, ...rest } = r
    return rest
  })
}

/* ---------- slots ---------- */

interface Default { sets: number; target: Target; restSec: number }

const DEFAULTS: Record<ExerciseCategory, Default> = {
  strength: { sets: 3, target: { kind: 'reps', low: 10, high: 12 }, restSec: 90 },
  core: { sets: 3, target: { kind: 'reps', low: 10, high: 10 }, restSec: 45 },
  mobility: { sets: 1, target: { kind: 'time', lowSec: 30, highSec: 30 }, restSec: 0 },
  cardio: { sets: 1, target: { kind: 'time', lowSec: 1200, highSec: 1500 }, restSec: 0 },
}

/** Ejercicios de una rutina, en todos sus bloques. Un ejercicio aparece una
 *  sola vez por rutina: el registro de series se agrupa por exerciseId +
 *  setIndex, asi que dos slots del mismo ejercicio compartirian series. */
export function routineExerciseIds(plan: TrainingPlan, routineId: string): Set<string> {
  const routine = plan.routines.find(r => r.id === routineId)
  return new Set(routine ? routine.blocks.flatMap(b => b.slots.map(s => s.exerciseId)) : [])
}

export function addSlot(plan: TrainingPlan, routineId: string, blockId: string, exerciseId: string, index?: number): TrainingPlan {
  const exercise = resolveExercise(plan, exerciseId)
  if (!exercise || routineExerciseIds(plan, routineId).has(exerciseId)) return plan
  const d = DEFAULTS[exercise.category]
  return editBlock(plan, routineId, blockId, (block, routine) => {
    const taken = new Set([...routine.blocks.flatMap(b => b.slots.map(s => s.id)), ...plan.warmup.slots.map(s => s.id)])
    const slot: PlanSlot = {
      id: uniqueId(`${routineId}-${exerciseId}`, taken),
      exerciseId,
      sets: d.sets,
      target: { ...d.target },
      restSec: d.restSec,
      note: '',
    }
    const at = index === undefined ? block.slots.length : Math.max(0, Math.min(index, block.slots.length))
    const slots = block.slots.slice()
    slots.splice(at, 0, slot)
    return { ...block, slots }
  })
}

export function removeSlot(plan: TrainingPlan, routineId: string, blockId: string, slotId: string): TrainingPlan {
  return editBlock(plan, routineId, blockId, block => {
    if (!block.slots.some(s => s.id === slotId)) return null
    return { ...block, slots: block.slots.filter(s => s.id !== slotId) }
  })
}

export function moveSlot(plan: TrainingPlan, routineId: string, blockId: string, slotId: string, direction: -1 | 1): TrainingPlan {
  return editBlock(plan, routineId, blockId, block => {
    const i = block.slots.findIndex(s => s.id === slotId)
    const j = i + direction
    if (i < 0 || j < 0 || j >= block.slots.length) return null
    const slots = block.slots.slice()
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
    return { ...block, slots }
  })
}

const positive = (n: number) => Number.isFinite(n) && n > 0

/** Devuelve el mensaje de error (en espanol) o null si el objetivo es valido. */
function targetError(t: Target): string | null {
  switch (t.kind) {
    case 'reps':
      if (!positive(t.low) || !positive(t.high)) return 'Las repeticiones deben ser números mayores que 0.'
      if (t.low > t.high) return 'El mínimo no puede ser mayor que el máximo.'
      if (t.holdSec !== undefined && !positive(t.holdSec)) return 'Los segundos de cada repetición deben ser mayores que 0.'
      return null
    case 'time':
      if (!positive(t.lowSec) || !positive(t.highSec)) return 'Los segundos deben ser números mayores que 0.'
      if (t.lowSec > t.highSec) return 'El mínimo no puede ser mayor que el máximo.'
      return null
    case 'distance':
      return positive(t.meters) ? null : 'Los metros deben ser un número mayor que 0.'
    case 'note':
      return null
  }
}

export type SlotPatch = Partial<Pick<PlanSlot, 'sets' | 'target' | 'restSec' | 'note' | 'primary'>>

export function updateSlot(
  plan: TrainingPlan,
  routineId: string,
  blockId: string,
  slotId: string,
  patch: SlotPatch,
): { plan: TrainingPlan; error: string | null } {
  if (patch.sets !== undefined && !(Number.isInteger(patch.sets) && patch.sets >= 1 && patch.sets <= 10)) {
    return { plan, error: 'Las series deben ser un número entero entre 1 y 10.' }
  }
  if (patch.restSec !== undefined && !(Number.isFinite(patch.restSec) && patch.restSec >= 0)) {
    return { plan, error: 'El descanso debe ser un número de segundos igual o mayor que 0.' }
  }
  if (patch.target) {
    const err = targetError(patch.target)
    if (err) return { plan, error: err }
  }
  const next = editBlock(plan, routineId, blockId, block => {
    if (!block.slots.some(s => s.id === slotId)) return null
    return { ...block, slots: block.slots.map(s => (s.id === slotId ? { ...s, ...patch } : s)) }
  })
  return { plan: next, error: null }
}

/** Cambia el ejercicio y conserva series, objetivo, descanso y nota. */
function withoutLabel(slot: PlanSlot): PlanSlot {
  const { label: _label, ...rest } = slot
  return rest
}

export function swapExercise(plan: TrainingPlan, routineId: string, blockId: string, slotId: string, exerciseId: string): TrainingPlan {
  if (!resolveExercise(plan, exerciseId) || routineExerciseIds(plan, routineId).has(exerciseId)) return plan
  return editBlock(plan, routineId, blockId, block => {
    const slot = block.slots.find(s => s.id === slotId)
    if (!slot || slot.exerciseId === exerciseId) return null
    // Otro ejercicio no hereda el nombre propio del anterior.
    return { ...block, slots: block.slots.map(s => (s.id === slotId ? withoutLabel({ ...s, exerciseId }) : s)) }
  })
}

/* ---------- ejercicios propios ---------- */

export function addCustomExercise(
  plan: TrainingPlan,
  input: { name: string; category: ExerciseCategory; primaryMuscles: string[]; musclewikiSlug?: string },
): TrainingPlan {
  const name = input.name.trim()
  if (name === '') return plan
  const taken = new Set(plan.customExercises.map(e => e.id))
  const slug = input.musclewikiSlug?.trim()
  return {
    ...plan,
    customExercises: [
      ...plan.customExercises,
      {
        id: uniqueId('custom-ex', taken),
        name,
        category: input.category,
        equipment: 'Sin especificar',
        primaryMuscles: input.primaryMuscles.map(m => m.trim()).filter(Boolean),
        secondaryMuscles: [],
        steps: [],
        cues: [],
        musclewiki: { slug: slug ? slug : null, id: null },
        custom: true,
      },
    ],
  }
}

/* ---------- restablecer ---------- */

/** Reemplaza por id las rutinas de la plantilla con copias nuevas (y vuelve a
 *  agregar las que falten). Las demas rutinas, archivadas o no, y los
 *  ejercicios propios no se tocan. */
export function resetToTemplate(plan: TrainingPlan, template: TrainingPlan = DEFAULT_PLAN): TrainingPlan {
  const templateIds = new Set(template.routines.map(r => r.id))
  const fresh = structuredClone(template.routines)
  return { ...plan, routines: [...fresh, ...plan.routines.filter(r => !templateIds.has(r.id))] }
}
