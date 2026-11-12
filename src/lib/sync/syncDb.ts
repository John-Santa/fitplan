// Base IndexedDB propia de la sincronización ('magnifit-sync'), separada de
// 'fitplan' para no tocar su versión ni sus almacenes. Guarda:
// - outbox: cambios locales pendientes de subir, uno por registro
//   (`${entity}:${key}`), así que escribir dos veces el mismo registro
//   coalesce en una sola entrada con lo último.
// - meta: cursor de bajada, última sincronización, usuario dueño de los datos
//   locales y último error.
const DB_NAME = 'magnifit-sync'
const DB_VERSION = 1
const STORE_OUTBOX = 'outbox'
const STORE_META = 'meta'

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
}

export const EMPTY_META: SyncMeta = { cursor: 0, lastSyncAt: null, userId: null, lastError: null }

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

/** Olvida outbox y meta. Lo usa "Borrar todos los datos": con el teléfono
 *  vacío, la próxima cuenta que entre empieza de cero (sin el bloqueo de
 *  "datos de otra cuenta"). */
export async function resetSyncState() {
  await Promise.all([
    tx(STORE_OUTBOX, 'readwrite', s => s.clear()),
    tx(STORE_META, 'readwrite', s => s.clear()),
  ])
}
