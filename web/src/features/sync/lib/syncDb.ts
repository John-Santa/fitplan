// Base IndexedDB propia de la sincronización ('magnifit-sync'), separada de
// 'fitplan' para no tocar su versión ni sus almacenes. Guarda:
// - outbox: cambios locales pendientes de subir, uno por registro
//   (`${entity}:${key}`), así que escribir dos veces el mismo registro
//   coalesce en una sola entrada con lo último.
// - meta: cursor de bajada, última sincronización, usuario dueño de los datos
//   locales y último error; además, bajo la llave 'preBootstrapBackup', la
//   copia de los datos locales que el primer ingreso guardó antes de que el
//   servidor ganara en un conflicto. Under 'configBase', the config as last
//   synced with the server (the base of the three-way merge, see
//   configMerge.ts), and under 'configConflict', the pending "esto cambió en
//   otro dispositivo" notice. Both are plain keys of the existing store: no
//   schema change, and an install without them simply has no base yet.
// - rejected: registros que el servidor rechazó uno por uno (400), con su
//   mensaje. Salieron del outbox para no bloquear al resto.
import type { Backup } from '../../../lib/types'

const DB_NAME = 'magnifit-sync'
const DB_VERSION = 2
const STORE_OUTBOX = 'outbox'
const STORE_META = 'meta'
const STORE_REJECTED = 'rejected'
const BACKUP_KEY = 'preBootstrapBackup'
const CONFIG_BASE_KEY = 'configBase'
const CONFIG_CONFLICT_KEY = 'configConflict'
const CONFIG_PUSHED_AT_KEY = 'configPushedAt'

export type Entity = 'document' | 'session' | 'measurement' | 'exerciseMeta'

export type OutboxEntry = {
  entity: Entity
  /** Llave natural: kind del documento, id de sesión, fecha de medición o
   *  exerciseId. */
  key: string
  body: unknown
  updatedAt: number
  deletedAt: number | null
}

export type SyncMeta = {
  cursor: number
  lastSyncAt: number | null
  /** Usuario de Clerk dueño de los datos locales; null = nunca se sincronizó. */
  userId: string | null
  lastError: string | null
  /** Pedido de bajar todo desde 0 en la próxima vuelta (tras restaurar un
   *  respaldo). Es la hora del pedido: solo se limpia si sigue siendo el
   *  mismo al terminar la bajada. */
  fullPullAt: number | null
}

export const EMPTY_META: SyncMeta = { cursor: 0, lastSyncAt: null, userId: null, lastError: null, fullPullAt: null }

export type RejectedEntry = OutboxEntry & { error: string; rejectedAt: number }

export type PreBootstrapBackup = { savedAt: number; backup: Backup }

export const outboxId = (entity: Entity, key: string) => `${entity}:${key}`

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) db.createObjectStore(STORE_OUTBOX)
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META)
      if (!db.objectStoreNames.contains(STORE_REJECTED)) db.createObjectStore(STORE_REJECTED)
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('No se pudo abrir la base de sincronización.'))
    }
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

/* ---------- outbox ---------- */

export const getOutbox = () => tx<OutboxEntry[]>(STORE_OUTBOX, 'readonly', s => s.getAll() as IDBRequest<OutboxEntry[]>)

export const getOutboxEntry = (entity: Entity, key: string) =>
  tx<OutboxEntry | undefined>(STORE_OUTBOX, 'readonly', s => s.get(outboxId(entity, key)) as IDBRequest<OutboxEntry | undefined>)

export const putOutboxEntry = (e: OutboxEntry) =>
  tx(STORE_OUTBOX, 'readwrite', s => s.put(e, outboxId(e.entity, e.key)))

export const removeOutboxEntry = (entity: Entity, key: string) =>
  tx(STORE_OUTBOX, 'readwrite', s => s.delete(outboxId(entity, key)))

/** Registra un alta o cambio. Reemplaza cualquier entrada pendiente del mismo
 *  registro (coalescencia: solo viaja lo último). */
export function enqueueUpsert(entity: Entity, key: string, body: unknown, updatedAt = Date.now()) {
  return putOutboxEntry({ entity, key, body: structuredClone(body), updatedAt, deletedAt: null })
}

/** Registra un borrado. El servidor exige un body válido también en las
 *  lápidas: se usa `lastBody` o, si falta, el de la entrada pendiente. Sin
 *  ningún body conocido no hay nada que el servidor pueda tener y no se
 *  encola nada. */
export async function enqueueDelete(entity: Entity, key: string, lastBody?: unknown, now = Date.now()) {
  const body = lastBody ?? (await getOutboxEntry(entity, key))?.body
  if (body == null) return
  await putOutboxEntry({ entity, key, body: structuredClone(body), updatedAt: now, deletedAt: now })
}

/* ---------- rechazados ---------- */

export const getRejected = () => tx<RejectedEntry[]>(STORE_REJECTED, 'readonly', s => s.getAll() as IDBRequest<RejectedEntry[]>)

export const removeRejected = (entity: Entity, key: string) =>
  tx(STORE_REJECTED, 'readwrite', s => s.delete(outboxId(entity, key)))

/** Pasa una entrada del outbox a 'rejected'. Si el registro cambió mientras
 *  se subía, la entrada nueva se queda en el outbox para otro intento. */
export async function rejectOutboxEntry(sent: OutboxEntry, error: string, now = Date.now()) {
  await tx(STORE_REJECTED, 'readwrite', s => s.put({ ...sent, error, rejectedAt: now }, outboxId(sent.entity, sent.key)))
  const current = await getOutboxEntry(sent.entity, sent.key)
  if (current && current.updatedAt === sent.updatedAt && current.deletedAt === sent.deletedAt) {
    await removeOutboxEntry(sent.entity, sent.key)
  }
}

/** "Reintentar": devuelve un rechazado al outbox con su updatedAt original y
 *  lo quita de la lista. Si el registro ya tiene una entrada más nueva en el
 *  outbox, esa gana y el rechazado solo se descarta. Devuelve si hubo algo
 *  que reintentar. */
export async function requeueRejected(entity: Entity, key: string): Promise<boolean> {
  const entry = (await getRejected()).find(r => r.entity === entity && r.key === key)
  if (!entry) return false
  const { error: _error, rejectedAt: _rejectedAt, ...pending } = entry
  if (!(await getOutboxEntry(entity, key))) await putOutboxEntry(pending)
  await removeRejected(entity, key)
  return true
}

/* ---------- copia previa al primer ingreso ---------- */

export const getPreBootstrapBackup = () =>
  tx<PreBootstrapBackup | undefined>(STORE_META, 'readonly', s => s.get(BACKUP_KEY) as IDBRequest<PreBootstrapBackup | undefined>)

/** Guarda la copia solo si no hay otra: si el primer ingreso se corta y se
 *  repite, la primera copia es la que tiene los datos originales. */
export async function savePreBootstrapBackup(backup: Backup, now = Date.now()) {
  if (await getPreBootstrapBackup()) return
  await tx(STORE_META, 'readwrite', s => s.put({ savedAt: now, backup } satisfies PreBootstrapBackup, BACKUP_KEY))
}

/* ---------- config merge (S15) ---------- */

/** Config as last synced with the server; undefined = no base stored yet. */
export const getConfigBase = () =>
  tx<unknown>(STORE_META, 'readonly', s => s.get(CONFIG_BASE_KEY) as IDBRequest<unknown>)

export const saveConfigBase = (config: unknown) =>
  tx(STORE_META, 'readwrite', s => s.put(structuredClone(config), CONFIG_BASE_KEY))

/** Labels of the settings where a local change lost to another device. */
export type ConfigConflict = { at: number; fields: string[] }

export const getConfigConflict = () =>
  tx<ConfigConflict | undefined>(STORE_META, 'readonly', s => s.get(CONFIG_CONFLICT_KEY) as IDBRequest<ConfigConflict | undefined>)

/** Adds labels to the pending notice (kept until dismissed). */
export async function addConfigConflict(fields: string[], now = Date.now()) {
  const prev = await getConfigConflict()
  const merged = [...new Set([...(prev?.fields ?? []), ...fields])]
  await tx(STORE_META, 'readwrite', s => s.put({ at: now, fields: merged } satisfies ConfigConflict, CONFIG_CONFLICT_KEY))
}

export const clearConfigConflict = () => tx(STORE_META, 'readwrite', s => s.delete(CONFIG_CONFLICT_KEY))

/** updatedAt of the last config push the server applied, until another
 *  device reports that it lost a merge (then cleared). */
export const getConfigPushedAt = () =>
  tx<number | undefined>(STORE_META, 'readonly', s => s.get(CONFIG_PUSHED_AT_KEY) as IDBRequest<number | undefined>)

export const saveConfigPushedAt = (updatedAt: number) =>
  tx(STORE_META, 'readwrite', s => s.put(updatedAt, CONFIG_PUSHED_AT_KEY))

export const clearConfigPushedAt = () => tx(STORE_META, 'readwrite', s => s.delete(CONFIG_PUSHED_AT_KEY))

/* ---------- meta ---------- */

export async function getMeta(): Promise<SyncMeta> {
  const stored = await tx<Partial<SyncMeta> | undefined>(STORE_META, 'readonly', s =>
    s.get('state') as IDBRequest<Partial<SyncMeta> | undefined>,
  )
  return { ...EMPTY_META, ...(stored ?? {}) }
}

export async function updateMeta(patch: Partial<SyncMeta>): Promise<SyncMeta> {
  const next = { ...(await getMeta()), ...patch }
  await tx(STORE_META, 'readwrite', s => s.put(next, 'state'))
  return next
}

/** Olvida outbox, meta (con la copia previa) y rechazados. Lo usa "Borrar todos los datos": con el teléfono
 *  vacío, la próxima cuenta que entre empieza de cero (sin el bloqueo de
 *  "datos de otra cuenta"). */
export async function resetSyncState() {
  await Promise.all([
    tx(STORE_OUTBOX, 'readwrite', s => s.clear()),
    tx(STORE_META, 'readwrite', s => s.clear()),
    tx(STORE_REJECTED, 'readwrite', s => s.clear()),
  ])
}
