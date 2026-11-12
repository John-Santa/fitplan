// Motor de sincronización offline-first (S6) y primer ingreso (S7).
//
// IndexedDB ('fitplan') sigue siendo la fuente de verdad local. Cada escritura
// local deja una entrada en el outbox ('magnifit-sync', ver syncDb.ts) y
// syncNow():
//  1. sube el outbox en lotes (≤ 200 registros, ≤ 4 MB) y quita lo que el
//     servidor respondió applied o stale (stale = el servidor tiene algo más
//     nuevo y la bajada lo trae);
//  2. baja desde el cursor hasta !hasMore y aplica cada registro remoto en
//     IndexedDB, salvo los que siguen pendientes en el outbox (lo local gana
//     hasta que se sube). Guarda el cursor después de cada página.
// Lo que se baja se escribe directo con db.ts, nunca con las funciones de
// localWrites.ts: así no se vuelve a encolar (sin eco).
//
// Primer ingreso (meta.userId vacío): baja todo desde 0 (el servidor gana en
// las llaves que existen en ambos lados), encola cada registro local que el
// servidor no tiene y lo sube. Nunca borra datos locales. Si meta.userId es
// OTRA cuenta, no mezcla: se detiene con OTHER_ACCOUNT_ERROR hasta que se
// vuelva a entrar con la cuenta original o se borren los datos del teléfono.
import { ApiError, pullChanges, pushChanges } from '../api'
import * as db from '../db'
import { mergeConfig, normalizeSession } from '../plan'
import { normalizePlan } from '../planStorage'
import type { ChangeSet, ItemResult, PushChangeSet } from '../syncTypes'
import type { ExerciseMeta, Measurement } from '../../types'
import * as sdb from './syncDb'
import type { Entity, OutboxEntry } from './syncDb'

export const OTHER_ACCOUNT_ERROR =
  'Esta app tiene datos de otra cuenta. Para no mezclarlos, la sincronización está en pausa: vuelve a iniciar ' +
  'sesión con la cuenta original, o exporta un respaldo y borra los datos de este dispositivo.'
export const OFFLINE_ERROR = 'Sin conexión'

export const PUSH_MAX_ITEMS = 200
export const PUSH_MAX_BYTES = 4 * 1024 * 1024
export const PULL_PAGE = 200
const WRITE_DEBOUNCE_MS = 3_000
const RETRY_BASE_MS = 5_000
const RETRY_MAX_MS = 5 * 60_000

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'blocked'

export type SyncStatus = {
  state: SyncState
  pending: number
  lastSyncAt: number | null
  lastError: string | null
}

/* ---------- estado del módulo ---------- */

let currentUser: string | null = null
let onRemoteChange: (() => void | Promise<void>) | null = null
let inflight: Promise<void> | null = null
let runAgain = false
let failures = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let status: SyncStatus = { state: 'idle', pending: 0, lastSyncAt: null, lastError: null }
const listeners = new Set<(s: SyncStatus) => void>()

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  for (const l of listeners) l(status)
}

export const getSyncStatus = () => status

export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Usuario de Clerk con sesión iniciada, o null (sin sesión: nada de red). */
export function setSyncUser(userId: string | null) {
  currentUser = userId
  if (!userId) clearTimers()
}

/** Lo llama el motor después de una bajada que cambió datos locales. */
export function setRemoteChangeHandler(fn: (() => void | Promise<void>) | null) {
  onRemoteChange = fn
}

function clearTimers() {
  if (retryTimer) clearTimeout(retryTimer)
  if (debounceTimer) clearTimeout(debounceTimer)
  retryTimer = debounceTimer = null
}

/** Relee cuántos cambios esperan subir y el último estado guardado. */
export async function refreshStatus() {
  const [outbox, meta] = await Promise.all([sdb.getOutbox(), sdb.getMeta()])
  setStatus({ pending: outbox.length, lastSyncAt: meta.lastSyncAt, lastError: meta.lastError })
}

/** Aviso de escritura local: sincroniza 3 s después de la última. */
export function noteLocalWrite() {
  void refreshStatus().catch(() => {})
  if (!currentUser) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void syncNow()
  }, WRITE_DEBOUNCE_MS)
}

/* ---------- sincronización ---------- */

/** Una sola sincronización a la vez: quien llama durante una en curso recibe
 *  la misma promesa, y se corre una vuelta más al terminar. Nunca rechaza:
 *  los errores quedan en el estado (lastError). */
export function syncNow(): Promise<void> {
  if (inflight) {
    runAgain = true
    return inflight
  }
  inflight = (async () => {
    try {
      let ok = true
      do {
        runAgain = false
        ok = await runOnce()
      } while (ok && runAgain && currentUser)
    } finally {
      inflight = null
    }
  })()
  return inflight
}

async function runOnce(): Promise<boolean> {
  const uid = currentUser
  if (!uid) return false
  const meta = await sdb.getMeta()
  if (meta.userId && meta.userId !== uid) {
    await sdb.updateMeta({ lastError: OTHER_ACCOUNT_ERROR })
    setStatus({ state: 'blocked', lastError: OTHER_ACCOUNT_ERROR })
    return false
  }
  setStatus({ state: 'syncing' })
  const changed = { value: false }
  try {
    if (!meta.userId) await bootstrap(uid, changed)
    else {
      await pushOutbox()
      await pullFrom(meta.cursor, changed)
    }
    failures = 0
    const saved = await sdb.updateMeta({ lastSyncAt: Date.now(), lastError: null })
    setStatus({ state: 'idle', lastSyncAt: saved.lastSyncAt, lastError: null })
    return true
  } catch (e) {
    const offline = isOffline(e)
    const message = offline ? OFFLINE_ERROR : `No se pudo sincronizar: ${e instanceof Error ? e.message : String(e)}`
    await sdb.updateMeta({ lastError: message }).catch(() => {})
    setStatus({ state: offline ? 'offline' : 'error', lastError: message })
    scheduleRetry()
    return false
  } finally {
    if (changed.value) await Promise.resolve(onRemoteChange?.()).catch(() => {})
    await refreshStatus().catch(() => {})
    if (status.state === 'syncing') setStatus({ state: 'idle' })
  }
}

function isOffline(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (e instanceof ApiError) return false
  // fetch sin red lanza TypeError; Clerk sin red lanza ClerkOfflineError.
  const err = e as { name?: unknown; code?: unknown } | null
  return e instanceof TypeError || err?.code === 'clerk_offline' || err?.name === 'ClerkOfflineError'
}

function scheduleRetry() {
  if (!currentUser) return
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** failures)
  failures++
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    retryTimer = null
    void syncNow()
  }, delay)
}

/* ---------- subida ---------- */

const encoder = new TextEncoder()
const byteSize = (v: unknown) => encoder.encode(JSON.stringify(v)).length

function batches(entries: OutboxEntry[]): OutboxEntry[][] {
  const out: OutboxEntry[][] = []
  let current: OutboxEntry[] = []
  let bytes = 0
  for (const e of entries) {
    const size = byteSize(e)
    if (current.length && (current.length >= PUSH_MAX_ITEMS || bytes + size > PUSH_MAX_BYTES)) {
      out.push(current)
      current = []
      bytes = 0
    }
    current.push(e)
    bytes += size
  }
  if (current.length) out.push(current)
  return out
}

/** Exactamente los campos del contrato: el servidor rechaza los desconocidos. */
function toPushSet(entries: OutboxEntry[]): PushChangeSet {
  const cs: PushChangeSet = { documents: [], sessions: [], measurements: [], exerciseMeta: [] }
  for (const { entity, key, body, updatedAt, deletedAt } of entries) {
    const stamp = { body, updatedAt, deletedAt }
    if (entity === 'document') cs.documents.push({ kind: key as 'plan' | 'config', ...stamp })
    else if (entity === 'session') cs.sessions.push({ id: key, ...stamp })
    else if (entity === 'measurement') cs.measurements.push({ date: key, ...stamp })
    else cs.exerciseMeta.push({ exerciseId: key, ...stamp })
  }
  return cs
}

async function pushOutbox() {
  const entries = await sdb.getOutbox()
  for (const batch of batches(entries)) {
    const res = await pushChanges(toPushSet(batch))
    const answered = new Set<string>()
    const mark = (entity: Entity, items: ItemResult[] | null | undefined) => {
      for (const r of items ?? []) if (r.status === 'applied' || r.status === 'stale') answered.add(sdb.outboxId(entity, r.key))
    }
    mark('document', res.documents)
    mark('session', res.sessions)
    mark('measurement', res.measurements)
    mark('exerciseMeta', res.exerciseMeta)
    for (const sent of batch) {
      if (!answered.has(sdb.outboxId(sent.entity, sent.key))) continue
      // Si el registro cambió otra vez mientras se subía, la entrada nueva
      // se queda para la próxima vuelta.
      const now = await sdb.getOutboxEntry(sent.entity, sent.key)
      if (now && now.updatedAt === sent.updatedAt && now.deletedAt === sent.deletedAt) {
        await sdb.removeOutboxEntry(sent.entity, sent.key)
      }
    }
  }
}

/* ---------- bajada ---------- */

type Remote = { entity: Entity; key: string; body: unknown; deletedAt: number | null }

function remoteRecords(page: ChangeSet): Remote[] {
  return [
    ...(page.documents ?? []).map(d => ({ entity: 'document' as const, key: d.kind, body: d.body, deletedAt: d.deletedAt })),
    ...(page.sessions ?? []).map(s => ({ entity: 'session' as const, key: s.id, body: s.body, deletedAt: s.deletedAt })),
    ...(page.measurements ?? []).map(m => ({ entity: 'measurement' as const, key: m.date, body: m.body, deletedAt: m.deletedAt })),
    ...(page.exerciseMeta ?? []).map(e => ({ entity: 'exerciseMeta' as const, key: e.exerciseId, body: e.body, deletedAt: e.deletedAt })),
  ]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Escribe un registro remoto en 'fitplan' con las mismas normalizaciones que
 *  la importación de respaldos v3. Devuelve si cambió algo local. Lo ilegible
 *  se ignora. Las lápidas de notas por ejercicio, plan y config no tienen
 *  camino de borrado local (la app nunca las borra) y se ignoran. */
async function applyRemote(r: Remote, allowDelete: boolean): Promise<boolean> {
  if (r.deletedAt != null) {
    if (!allowDelete) return false
    if (r.entity === 'session') await db.deleteSession(r.key)
    else if (r.entity === 'measurement') await db.deleteMeasurement(r.key)
    else return false
    return true
  }
  if (r.entity === 'session') {
    const s = normalizeSession(r.body)
    if (!s || s.id !== r.key) return false
    await db.saveSession(s)
  } else if (r.entity === 'measurement') {
    if (!isObject(r.body) || r.body.date !== r.key) return false
    await db.saveMeasurement(r.body as unknown as Measurement)
  } else if (r.entity === 'exerciseMeta') {
    if (!isObject(r.body) || r.body.exerciseId !== r.key) return false
    await db.saveExerciseMeta(r.body as unknown as ExerciseMeta)
  } else if (r.key === 'config') {
    if (!isObject(r.body)) return false
    await db.saveConfig(mergeConfig(r.body))
  } else if (r.key === 'plan') {
    const plan = normalizePlan(r.body)
    if (!plan) return false
    await db.savePlan(plan)
  } else return false
  return true
}

/** Baja páginas desde `since`. `onPage` decide qué hacer con cada registro. */
async function pullPages(since: number, onRecord: (r: Remote) => Promise<void>) {
  let cursor = since
  for (;;) {
    const page = await pullChanges(cursor, PULL_PAGE)
    for (const r of remoteRecords(page)) await onRecord(r)
    const advanced = typeof page.cursor === 'number' && page.cursor > cursor
    if (advanced) {
      cursor = page.cursor
      await sdb.updateMeta({ cursor })
    }
    if (!page.hasMore || !advanced) return
  }
}

async function pullFrom(since: number, changed: { value: boolean }) {
  await pullPages(since, async r => {
    // Lo local pendiente gana hasta que se sube.
    if (await sdb.getOutboxEntry(r.entity, r.key)) return
    if (await applyRemote(r, true)) changed.value = true
  })
}

/* ---------- primer ingreso (S7) ---------- */

async function bootstrap(uid: string, changed: { value: boolean }) {
  await sdb.updateMeta({ cursor: 0 })
  const remoteLive = new Set<string>()
  await pullPages(0, async r => {
    const id = sdb.outboxId(r.entity, r.key)
    // Una lápida remota no borra nada local en el primer ingreso: si el
    // registro sigue aquí, se vuelve a subir como solo-local.
    if (r.deletedAt != null) {
      remoteLive.delete(id)
      return
    }
    remoteLive.add(id)
    // En las llaves que existen en ambos lados gana el servidor.
    await sdb.removeOutboxEntry(r.entity, r.key)
    if (await applyRemote(r, false)) changed.value = true
  })

  await enqueueLocal(remoteLive)

  // Desde aquí los datos locales son de esta cuenta: si la subida falla, el
  // outbox ya tiene todo y la próxima vuelta es una sincronización normal.
  await sdb.updateMeta({ userId: uid })
  await pushOutbox()
}

/** Encola cada registro local cuya llave no esté en `skip`, con
 *  updatedAt = ahora. */
async function enqueueLocal(skip: Set<string>) {
  const now = Date.now()
  const enqueue = async (entity: Entity, key: string, body: unknown) => {
    if (!skip.has(sdb.outboxId(entity, key))) await sdb.enqueueUpsert(entity, key, body, now)
  }
  const [{ sessions }, measurements, metas, config, storedPlan] = await Promise.all([
    db.getSessions(),
    db.getMeasurements(),
    db.getExerciseMeta(),
    db.getConfig(),
    db.getPlan(),
  ])
  for (const s of sessions) await enqueue('session', s.id, s)
  for (const m of measurements) await enqueue('measurement', m.date, m)
  for (const m of metas) await enqueue('exerciseMeta', m.exerciseId, m)
  if (config) await enqueue('document', 'config', mergeConfig(config))
  const plan = normalizePlan(storedPlan)
  if (plan) await enqueue('document', 'plan', plan)
}

/** Tras restaurar un respaldo: todo lo local pasa a ser lo más nuevo y se
 *  sube. Lo que solo existe en el servidor no se borra allá. */
export async function enqueueAllLocalChanges() {
  await enqueueLocal(new Set())
  noteLocalWrite()
}

/* ---------- pruebas ---------- */

/** Solo para pruebas: olvida el estado del módulo. */
export function resetSyncEngineForTests() {
  clearTimers()
  currentUser = null
  onRemoteChange = null
  inflight = null
  runAgain = false
  failures = 0
  status = { state: 'idle', pending: 0, lastSyncAt: null, lastError: null }
  listeners.clear()
}
