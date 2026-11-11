// Consultas sobre el plan editable. Reemplazan los helpers de plan.ts que
// leian la constante ROUTINES: aca todo recibe el plan del store. Puro: sin
// React ni IndexedDB. La cuenta de semanas y de series vive en phases.ts y
// no se repite aca.
import type { DayPlan, PlanRoutine, PlanSlot, RoutineId, TrainingPlan, WeeklyRoutine } from '../types'
import { KIND_LABELS, weekdayLabel } from './plan'
import { resolveExercise } from './library'
import { phaseForWeek, setsForSlot, slotsForWeek } from './phases'

type Routines = Pick<TrainingPlan, 'routines'>

/** Rutina por id, ARCHIVADAS incluidas: el historial y un dia de la semana
 *  que todavia la apunta siguen resolviendo su nombre y sus ejercicios. */
export function findRoutine(plan: Routines, id: RoutineId): PlanRoutine | undefined {
  return plan.routines.find(r => r.id === id)
}

/** Rutinas que se ofrecen para elegir o empezar: las no archivadas. */
export function activeRoutines(plan: Routines): PlanRoutine[] {
  return plan.routines.filter(r => !r.archived)
}

export const UNKNOWN_ROUTINE_TITLE = 'Rutina eliminada'

/** Routine name as shown: the session focus without the "Día N –" prefix,
 *  because routines are not tied to weekdays in that order. Display only;
 *  the stored name is untouched. */
export function routineDisplayName(name: string): string {
  const stripped = name.replace(/^D[ií]a\s*\d+\s*[–—:.-]\s*/i, '').trim()
  return stripped === '' ? name : stripped
}

/** Routines ordered by their focus (display name), not by day number. */
export function sortByFocus<T extends Pick<PlanRoutine, 'name'>>(routines: readonly T[]): T[] {
  return [...routines].sort((a, b) =>
    routineDisplayName(a.name).localeCompare(routineDisplayName(b.name), 'es', { sensitivity: 'base', numeric: true }))
}

/** Nombre visible de una rutina; si el id ya no existe, un texto fijo. */
export function routineTitle(plan: Routines, id: RoutineId): string {
  const r = findRoutine(plan, id)
  return r ? routineDisplayName(r.name) : UNKNOWN_ROUTINE_TITLE
}

/** Titulo visible del dia. title vacio = derivado: el nombre de la rutina si es
 *  entreno, la etiqueta del kind si no. Nunca devuelve cadena vacia. */
export function dayTitleFor(plan: Routines, day: DayPlan): string {
  if (day.title.trim() !== '') return day.title
  if (day.kind === 'training') {
    const r = findRoutine(plan, day.routineId)
    return r ? routineDisplayName(r.name) : KIND_LABELS.training
  }
  return KIND_LABELS[day.kind]
}

/** Rutina de hoy segun la semana configurada. null si el dia no es de entreno
 *  o la rutina ya no existe. Resuelve tambien las archivadas. */
export function routineForWeekday(plan: Routines, week: WeeklyRoutine, dow: number): PlanRoutine | null {
  const day = week[dow]
  return day.kind === 'training' ? (findRoutine(plan, day.routineId) ?? null) : null
}

/** Dias (0..6) que tienen asignada esa rutina. Vacio si no tiene ninguno. */
export function weekdaysForRoutine(week: WeeklyRoutine, routineId: RoutineId): number[] {
  const out: number[] = []
  for (let dow = 0; dow < 7; dow++) {
    const day = week[dow]
    if (day.kind === 'training' && day.routineId === routineId) out.push(dow)
  }
  return out
}

/** Un solo dia para la insignia de Inicio: la proxima aparicion contando desde
 *  hoy, y si ya paso, la primera de la semana. null si no tiene dia asignado. */
export function nextWeekdayFor(week: WeeklyRoutine, routineId: RoutineId, fromDow: number): number | null {
  const days = weekdaysForRoutine(week, routineId)
  if (days.length === 0) return null
  return days.find(d => d >= fromDow) ?? days[0]
}

/** Todos los dias de la rutina, para la linea descriptiva de Entrenar. */
export function routineDaysLabel(week: WeeklyRoutine, routineId: RoutineId): string {
  const days = weekdaysForRoutine(week, routineId)
  if (days.length === 0) return 'Sin día asignado'
  return days.map(weekdayLabel).join(' · ')
}

/** Rutina propuesta al marcar un dia como entreno: la primera ACTIVA sin dia
 *  asignado; si todas tienen, la primera activa; sin activas, la primera del
 *  plan. null si el plan no tiene ninguna rutina. */
export function suggestRoutineIdFor(plan: Routines, week: WeeklyRoutine): RoutineId | null {
  const active = activeRoutines(plan)
  const pick = active.find(r => weekdaysForRoutine(week, r.id).length === 0) ?? active[0] ?? plan.routines[0]
  return pick?.id ?? null
}

/** Slots de la rutina que aplican en esa semana, de todos los bloques. */
export function routineSlots(routine: PlanRoutine, week: number): PlanSlot[] {
  return routine.blocks.flatMap(b => slotsForWeek(b, week))
}

/** Series totales de la rutina en esa semana: suma de setsForSlot sobre los
 *  slots vigentes, sin contar los items de solo nota (no tienen series). */
export function routineSetCount(plan: Pick<TrainingPlan, 'routines' | 'phases'>, routine: PlanRoutine, week: number): number {
  const phase = phaseForWeek(plan, week)
  return routineSlots(routine, week)
    .filter(s => s.target.kind !== 'note')
    .reduce((a, s) => a + setsForSlot(s, phase), 0)
}

/** Nombre corto de la rutina ("Tren inferior A"), para el titular de inicio.
 *  Corta tras la raya larga o la corta, que separa "Día N" del nombre. */
export function routineShortName(routine: Pick<PlanRoutine, 'name'>): string {
  const shown = routineDisplayName(routine.name)
  if (shown !== routine.name) return shown
  const m = /\s[–—]\s/.exec(routine.name)
  return m ? routine.name.slice(m.index + m[0].length).trim() : routine.name
}

/** "Semana 3 de 12"; pasado el final del plan, "Plan completado". */
export function weekLabel(totalWeeks: number, week: number): string {
  return week > totalWeeks ? 'Plan completado' : `Semana ${week} de ${totalWeeks}`
}

export type WeekState = 'done' | 'current' | 'upcoming'

/** Estado de cada semana del plan, para la barra de Inicio. Pasado el final,
 *  todas quedan hechas. */
export function planWeekStates(totalWeeks: number, currentWeek: number): { week: number; state: WeekState }[] {
  return Array.from({ length: totalWeeks }, (_, i) => {
    const week = i + 1
    return { week, state: week < currentWeek ? 'done' : week === currentWeek ? 'current' : 'upcoming' }
  })
}

/* ---------- pasos de la sesion ---------- */

/** Un paso de la sesion: un slot, o varios consecutivos que comparten group
 *  (superserie o circuito). */
export interface SessionStep {
  key: string
  blockId: string
  blockTitle: string
  blockNote: string
  /** Primer paso de su bloque: la vista muestra el titulo del bloque. */
  firstInBlock: boolean
  group: string | null
  slots: PlanSlot[]
}

export function buildSessionSteps(routine: PlanRoutine, week: number): SessionStep[] {
  const steps: SessionStep[] = []
  for (const block of routine.blocks) {
    let first = true
    for (const slot of slotsForWeek(block, week)) {
      const last = steps[steps.length - 1]
      if (slot.group && last && last.blockId === block.id && last.group === slot.group) {
        last.slots.push(slot)
        continue
      }
      steps.push({
        key: slot.id,
        blockId: block.id,
        blockTitle: block.title,
        blockNote: block.note,
        firstInBlock: first,
        group: slot.group ?? null,
        slots: [slot],
      })
      first = false
    }
  }
  return steps
}

/** "Superserie" si todos son levantamientos de repeticiones; "Circuito · N
 *  rondas" si alguno es de tiempo, distancia o sostenido. */
export function groupLabel(slots: PlanSlot[], rounds: number): string {
  const lifts = slots.every(s => s.target.kind === 'reps' && s.target.holdSec === undefined)
  if (lifts) return 'Superserie'
  return `Circuito · ${rounds} ${rounds === 1 ? 'ronda' : 'rondas'}`
}

/* ---------- nombres de ejercicio ---------- */

type Customs = Pick<TrainingPlan, 'customExercises'>

/** Nombre visible del ejercicio de un slot: la etiqueta de la rutina si la
 *  tiene, si no el de la biblioteca o el propio, y por ultimo el id. */
export function slotExerciseName(plan: Customs, slot: Pick<PlanSlot, 'exerciseId' | 'label'>): string {
  return slot.label ?? resolveExercise(plan, slot.exerciseId)?.name ?? slot.exerciseId
}

/** Nombre de un ejercicio en el contexto de una rutina (historial, resumen de
 *  sesion): la etiqueta del slot de esa rutina si la hay, si no el nombre del
 *  ejercicio. Otras rutinas con el mismo ejercicio no se ven afectadas. */
export function exerciseNameInRoutine(plan: Routines & Customs, routineId: RoutineId, exerciseId: string): string {
  const slot = findRoutine(plan, routineId)?.blocks.flatMap(b => b.slots).find(s => s.exerciseId === exerciseId && s.label)
  return slot?.label ?? resolveExercise(plan, exerciseId)?.name ?? exerciseId
}
