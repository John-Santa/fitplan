// Motor de fases del plan de 12 semanas. Puro: sin React ni IndexedDB.
import type { Phase, PlanSlot, RoutineBlock, Target, TrainingPlan } from './types'

/** Semana del bloque, base 1. Misma cuenta que blockPhase (plan.ts): dias
 *  enteros desde el inicio entre 7. Una fecha anterior al inicio cae en la
 *  semana 1. No topa por arriba: el plan decide que hay despues de la ultima
 *  semana (phaseForWeek devuelve null). */
export function blockWeekNumber(today: Date, blockStart: string): number {
  const start = new Date(blockStart + 'T00:00:00')
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000)
  return Math.max(Math.floor(diffDays / 7) + 1, 1)
}

/** Fila de la tabla de progresion que cubre esa semana, o null fuera del plan. */
export function phaseForWeek(plan: Pick<TrainingPlan, 'phases'>, week: number): Phase | null {
  return plan.phases.find(p => week >= p.fromWeek && week <= p.toWeek) ?? null
}

export type BlockState = 'upcoming' | 'active' | 'ended'

/** Estado del bloque respecto de hoy: 'ended' cuando hoy es posterior a
 *  `blockEnd` (el dia de blockEnd todavia es activo), 'upcoming' antes del
 *  inicio. Funcion aparte para no cambiar lo que devuelve phaseForWeek, que
 *  tiene otros usuarios. */
export function blockStatus(today: Date, blockStart: string, blockEnd: string): { state: BlockState; week: number } {
  const week = blockWeekNumber(today, blockStart)
  const start = new Date(blockStart + 'T00:00:00')
  const end = new Date(blockEnd + 'T23:59:59.999')
  const state: BlockState = today.getTime() < start.getTime() ? 'upcoming' : today.getTime() > end.getTime() ? 'ended' : 'active'
  return { state, week }
}

/** Series que toca hacer en un slot durante una fase. Sin fase, las base. */
export function setsForSlot(slot: PlanSlot, phase: Phase | null): number {
  if (!phase) return slot.sets
  const rule = phase.rule
  switch (rule.kind) {
    case 'cap':
      return Math.min(slot.sets, rule.sets)
    case 'base':
      return slot.sets
    case 'primaryBoost':
      return slot.primary ? Math.max(slot.sets, rule.sets) : slot.sets
    case 'half':
      return Math.max(1, Math.ceil(slot.sets / 2))
  }
}

/** Slots de un bloque que aplican en esa semana (los que traen `weeks`). */
export function slotsForWeek(block: RoutineBlock, week: number): PlanSlot[] {
  return block.slots.filter(s => {
    if (!s.weeks) return true
    return week >= s.weeks.from && (s.weeks.to === undefined || week <= s.weeks.to)
  })
}

const range = (low: number, high: number): string => (low === high ? `${low}` : `${low}–${high}`)

/** Etiqueta corta de una prescripcion: "10–12", "8–10 por pierna" (el sufijo
 *  generico es "por lado"), "6 × 10 s", "20–30 s por lado", "30 m por lado".
 *  Un item de solo nota no tiene etiqueta. */
export function formatTarget(target: Target): string {
  // El plan dice "por pierna" en los ejercicios unilaterales de pierna y "por lado" en el resto.
  const side = (t: { perSide?: boolean; sideUnit?: 'pierna' }) => (t.perSide ? ` por ${t.sideUnit ?? 'lado'}` : '')
  switch (target.kind) {
    case 'reps': {
      const base = target.holdSec !== undefined ? `${range(target.low, target.high)} × ${target.holdSec} s` : range(target.low, target.high)
      return base + side(target)
    }
    case 'time':
      return `${range(target.lowSec, target.highSec)} s${side(target)}`
    case 'distance':
      return `${target.meters} m${side(target)}`
    case 'note':
      return ''
  }
}
