import type { Session } from '../../../lib/types'

/** Sesion lista para guardar tras editar una terminada: conserva la hora de
 *  fin original (la edicion no la mueve) y, en fuerza, descarta las series sin
 *  marcar como hechas, igual que al terminar. Se guarda con saveSession, que
 *  actualiza por id. */
export function applySessionEdit(original: Session, edited: Session): Session {
  const base = { ...edited, id: original.id, finishedAt: original.finishedAt ?? edited.finishedAt }
  return base.kind === 'strength' ? { ...base, sets: base.sets.filter(s => s.done) } : base
}
