// Escrituras locales que también quedan en el outbox para subirse. Son el
// único camino de escritura de store.tsx; lo que llega de una bajada usa
// db.ts directo y por eso nunca se vuelve a encolar (sin eco).
//
// Con login deshabilitado (build sin VITE_CLERK_PUBLISHABLE_KEY) no se
// encola nada: la app queda exactamente como antes. Con login habilitado pero
// sin sesión iniciada SÍ se encola, para que al entrar se suba lo hecho
// mientras tanto (el primer ingreso igual sube todo lo que falte).
import type { Config, ExerciseMeta, Measurement, Session, TrainingPlan } from '../../../lib/types'
import { authEnabled } from '../../account/lib/auth'
import * as db from '../../../lib/db'
import { mergeConfig } from '../../../lib/plan'
import { rebaseConfigEdit } from './configMerge'
import { conflictRecord, withConflictRecord } from './configSync'
import { noteLocalWrite } from './engine'
import { enqueueDelete, enqueueUpsert, getOutboxEntry, type Entity } from './syncDb'

let tracking = authEnabled

/** Solo para pruebas: activa o desactiva el registro en el outbox. */
export function setTrackingForTests(on: boolean) {
  tracking = on
}

async function track(fn: () => Promise<unknown>) {
  if (!tracking) return
  try {
    await fn()
    noteLocalWrite()
  } catch (e) {
    // El dato ya quedó guardado localmente: un fallo del outbox no debe
    // romper la pantalla. El primer ingreso vuelve a subir lo que falte.
    console.warn('No se pudo registrar el cambio para sincronizar', e)
  }
}

const upsert = (entity: Entity, key: string, body: unknown) => track(() => enqueueUpsert(entity, key, body))

export async function saveSession(s: Session) {
  await db.saveSession(s)
  await upsert('session', s.id, s)
}

export async function deleteSession(id: string) {
  // El servidor exige un body válido (kind, date) también en la lápida: se
  // guarda el último conocido antes de borrar.
  const last = tracking ? (await db.getSessions()).sessions.find(s => s.id === id) : undefined
  await db.deleteSession(id)
  await track(() => enqueueDelete('session', id, last))
}

export async function saveMeasurement(m: Measurement) {
  await db.saveMeasurement(m)
  await upsert('measurement', m.date, m)
}

/** Saves `patch` over the measurement stored for its date (see
 *  db.mergeMeasurement) through saveMeasurement, so the outbox gets the merged
 *  record. The stored copy is read here, not taken from a screen's memory,
 *  which may be stale after a sync. */
export async function mergeMeasurement(patch: Measurement) {
  await saveMeasurement(db.mergeMeasurement(await db.getMeasurement(patch.date), patch))
}

export async function deleteMeasurement(date: string) {
  const last = tracking ? (await db.getMeasurements()).find(m => m.date === date) : undefined
  await db.deleteMeasurement(date)
  await track(() => enqueueDelete('measurement', date, last))
}

export async function saveExerciseMeta(m: ExerciseMeta) {
  await db.saveExerciseMeta(m)
  await upsert('exerciseMeta', m.exerciseId, m)
}

export async function saveConfig(c: Config) {
  await db.saveConfig(c)
  // A queued merge may carry a conflict record for another device (see
  // configSync.ts): a new edit replaces the queued body but keeps the record.
  await track(async () => {
    const queued = conflictRecord((await getOutboxEntry('document', 'config'))?.body)
    await enqueueUpsert('document', 'config', withConflictRecord(c, queued))
  })
}

/** Saves an edit a screen made from `seen`, its in-memory copy. A sync may
 *  have merged another device's changes into the stored config since then
 *  (S15): the edit is applied over the stored copy instead of replacing it,
 *  so those changes survive. */
export async function saveConfigEdit(seen: Config, edited: Config) {
  await saveConfig(rebaseConfigEdit(seen, edited, mergeConfig(await db.getConfig())))
}

export async function savePlan(p: TrainingPlan) {
  await db.savePlan(p)
  await upsert('document', 'plan', p)
}
