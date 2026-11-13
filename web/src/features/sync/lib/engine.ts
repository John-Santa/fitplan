// Motor de sincronización offline-first (S6) y primer ingreso (S7).
//
// IndexedDB ('fitplan') sigue siendo la fuente de verdad local. Cada escritura
// local deja una entrada en el outbox ('magnifit-sync', ver syncDb.ts) y
// syncNow():
//  1. sube el outbox en lotes (≤ 200 registros, ≤ 4 MB) y quita lo que el
//     servidor respondió applied o stale. Si un lote vuelve 400, lo reintenta
//     registro por registro: los que el servidor rechaza solos pasan a
//     'rejected' (con su mensaje) y el resto sigue;
//  2. baja desde el cursor hasta !hasMore y aplica cada registro remoto en
//     IndexedDB, salvo los que siguen pendientes en el outbox (lo local gana
//     hasta que se sube). Guarda el cursor después de cada página. Si hubo
//     algún stale, o se restauró un respaldo, baja desde 0: con relojes
//     desfasados el cursor ya puede estar más allá de la copia más nueva del
//     servidor, y sin esto el teléfono quedaría distinto para siempre.
// Lo que se baja se escribe directo con db.ts, nunca con las funciones de
// localWrites.ts: así no se vuelve a encolar (sin eco).
//
// Primer ingreso (meta.userId vacío): baja todo desde 0 y decide llave por
// llave (ver bootstrap): si un lado es la semilla de una instalación nueva,
// gana el otro; si ambos difieren, gana el servidor pero antes se guarda una
// copia de todos los datos locales. Encola y sube lo que el servidor no tiene
// (o lo que gana localmente). Nunca borra datos locales. Si meta.userId es
// OTRA cuenta, no mezcla: se detiene con OTHER_ACCOUNT_ERROR hasta que se
// vuelva a entrar con la cuenta original o se borren los datos del teléfono.
//
// Cuenta eliminada (S4): si la API responde 410 a la subida o a la bajada, la
// cuenta se eliminó (por ejemplo desde otro dispositivo). Se borra la copia
// local (eraseLocalCopy), se deja de sincronizar y el estado queda 'blocked'
// con ACCOUNT_DELETED_ERROR.
import { ApiError, pullChanges, pushChanges } from '../api'
import * as db from '../../../lib/db'
import { eraseLocalCopy } from './erase'
import { planMigration } from '../../../lib/migration'
import { BASELINE, DEFAULT_CONFIG, mergeConfig, normalizeSession } from '../../../lib/plan'
import { PLAN_TEMPLATES, templatePlan } from '../../../lib/defaultPlan'
import { normalizePlan } from '../../../lib/planStorage'
import type { ChangeSet, ItemResult, PushChangeSet } from '../syncTypes'
import type { ExerciseMeta, Measurement } from '../../../lib/types'
import * as sdb from './syncDb'
import type { Entity, OutboxEntry } from './syncDb'
import { mergePendingConfig, noteConfigSynced } from './configSync'
import { defaultDisciplines, hasDisciplines, withDisciplines } from '../../../lib/disciplineSelection'

export const OTHER_ACCOUNT_ERROR =
  'Esta app tiene datos de otra cuenta. Para no mezclarlos, la sincronización está en pausa: vuelve a iniciar ' +
  'sesión con la cuenta original, o exporta un respaldo y borra los datos de este dispositivo.'
export const OFFLINE_ERROR = 'Sin conexión'
export const ACCOUNT_DELETED_ERROR =
  'Esta cuenta fue eliminada. Borramos sus datos de este dispositivo; para volver a sincronizar, crea una cuenta nueva.'
export const AUTH_EXPIRED_ERROR = 'Tu sesión expiró, vuelve a iniciar sesión'

export const PUSH_MAX_ITEMS = 200
export const PUSH_MAX_BYTES = 4 * 1024 * 1024
export const PULL_PAGE = 200
const WRITE_DEBOUNCE_MS = 3_000
const RETRY_BASE_MS = 5_000
const RETRY_MAX_MS = 5 * 60_000
/** Pasado este tiempo sin respuesta, la API del plan gratuito está arrancando. */
export const COLD_START_MS = 4_000

/** 'connecting': la vuelta lleva más de COLD_START_MS sin terminar (arranque
 *  en frío del servidor). */
export type SyncState = 'idle' | 'syncing' | 'connecting' | 'offline' | 'error' | 'blocked' | 'auth_expired'

export type SyncStatus = {
  state: SyncState
  pending: number
  lastSyncAt: number | null
  lastError: string | null
  /** Registros que el servidor rechazó y salieron del outbox. */
  rejected: number
  /** Mensaje del primer rechazado. */
  rejectedError: string | null
  /** Hora de la copia que guardó el primer ingreso, o null si no hay. */
  backupAt: number | null
}

const IDLE: SyncStatus = { state: 'idle', pending: 0, lastSyncAt: null, lastError: null, rejected: 0, rejectedError: null, backupAt: null }

/* ---------- estado del módulo ---------- */

let currentUser: string | null = null
let onRemoteChange: (() => void | Promise<void>) | null = null
let inflight: Promise<void> | null = null
let runAgain = false
let failures = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let coldStartTimer: ReturnType<typeof setTimeout> | null = null
let status: SyncStatus = IDLE
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
  const [outbox, meta, rejected, backup] = await Promise.all([
    sdb.getOutbox(),
    sdb.getMeta(),
    sdb.getRejected(),
    sdb.getPreBootstrapBackup(),
  ])
  setStatus({
    pending: outbox.length,
    lastSyncAt: meta.lastSyncAt,
    lastError: meta.lastError,
    rejected: rejected.length,
    rejectedError: rejected[0]?.error ?? null,
    backupAt: backup?.savedAt ?? null,
  })
}

/** "Reintentar" de un cambio rechazado: vuelve al outbox y se sube de nuevo. */
export async function retryRejected(entity: Entity, key: string) {
  await sdb.requeueRejected(entity, key)
  await refreshStatus()
  if (currentUser) await syncNow()
}

/** "Descartar" un cambio rechazado: solo quita el aviso; el dato sigue en
 *  este dispositivo. */
export async function discardRejected(entity: Entity, key: string) {
  await sdb.removeRejected(entity, key)
  await refreshStatus()
}

/** Aviso de escritura local: sincroniza 3 s después de la última. */
export function noteLocalWrite() {
  void refreshStatus().catch(() => {})
  // Con la sesión expirada no se insiste solo: la cola espera a que vuelva
  // un token (resumeAfterAuth) o a que la persona pida sincronizar.
  if (!currentUser || status.state === 'auth_expired') return
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
  coldStartTimer = setTimeout(() => {
    coldStartTimer = null
    if (status.state === 'syncing') setStatus({ state: 'connecting' })
  }, COLD_START_MS)
  const changed = { value: false }
  try {
    if (!meta.userId) await bootstrap(uid, changed)
    else {
      // S15: a queued config change is merged with the server copy before
      // it is pushed, so the push never overwrites another device's fields.
      if (await sdb.getOutboxEntry('document', 'config')) await pullFrom(meta.cursor, changed)
      const { stale } = await pushOutbox()
      const full = stale || meta.fullPullAt != null
      await pullFrom(full ? 0 : (await sdb.getMeta()).cursor, changed)
      // A stale config stays queued and the pull merged it: push the merge.
      if (stale && (await sdb.getOutboxEntry('document', 'config'))) runAgain = true
      // Solo se limpia el pedido que se atendió: uno nuevo hecho durante esta
      // vuelta se queda para la próxima.
      if (meta.fullPullAt != null && (await sdb.getMeta()).fullPullAt === meta.fullPullAt) {
        await sdb.updateMeta({ fullPullAt: null })
      }
    }
    failures = 0
    const saved = await sdb.updateMeta({ lastSyncAt: Date.now(), lastError: null })
    setStatus({ state: 'idle', lastSyncAt: saved.lastSyncAt, lastError: null })
    return true
  } catch (e) {
    if (isGone(e)) {
      await accountDeleted()
      changed.value = true
      return false
    }
    if (!isOffline(e) && isUnauthorized(e)) {
      // El servidor no acepta el token: reintentar solo repetiría el 401. El
      // outbox y el cursor quedan como están hasta que llegue un token nuevo.
      await sdb.updateMeta({ lastError: AUTH_EXPIRED_ERROR }).catch(() => {})
      setStatus({ state: 'auth_expired', lastError: AUTH_EXPIRED_ERROR })
      clearTimers()
      failures = 0
      return false
    }
    const offline = isOffline(e)
    const waitMs = rateLimitWait(e)
    const message = offline
      ? OFFLINE_ERROR
      : waitMs != null
        ? `Demasiadas solicitudes: se reintenta en ${Math.ceil(waitMs / 1000)} s`
        : `No se pudo sincronizar: ${e instanceof Error ? e.message : String(e)}`
    await sdb.updateMeta({ lastError: message }).catch(() => {})
    setStatus({ state: offline ? 'offline' : 'error', lastError: message })
    scheduleRetry(waitMs ?? 0)
    return false
  } finally {
    if (coldStartTimer) clearTimeout(coldStartTimer)
    coldStartTimer = null
    if (changed.value) await Promise.resolve(onRemoteChange?.()).catch(() => {})
    await refreshStatus().catch(() => {})
    if (status.state === 'syncing' || status.state === 'connecting') setStatus({ state: 'idle' })
  }
}

const isGone = (e: unknown) => e instanceof ApiError && e.status === 410

/** La API dice que la cuenta ya no existe: se borra la copia local y se deja
 *  de sincronizar hasta que otra sesión vuelva a fijar el usuario. */
async function accountDeleted() {
  currentUser = null
  clearTimers()
  failures = 0
  // syncNow nunca rechaza: si el borrado local falla, igual queda bloqueado.
  await eraseLocalCopy().catch(() => {})
  await sdb.updateMeta({ lastError: ACCOUNT_DELETED_ERROR }).catch(() => {})
  setStatus({ state: 'blocked', lastError: ACCOUNT_DELETED_ERROR })
}

function isOffline(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (e instanceof ApiError) return false
  // fetch sin red lanza TypeError; Clerk sin red lanza ClerkOfflineError.
  const err = e as { name?: unknown; code?: unknown } | null
  return e instanceof TypeError || err?.code === 'clerk_offline' || err?.name === 'ClerkOfflineError'
}

const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401

/** Lo llama la app cuando Clerk entrega un token nuevo (o vuelve a iniciar
 *  sesión): si la sincronización estaba detenida por un 401, reanuda con el
 *  outbox intacto. Con cualquier otro estado no hace nada. */
export function resumeAfterAuth() {
  if (status.state === 'auth_expired' && currentUser) void syncNow()
}

/** Un 429 es transitorio: devuelve la espera que pidió el servidor (Retry-After,
 *  0 si no la dio) o null si el error no es un 429. */
function rateLimitWait(e: unknown): number | null {
  return e instanceof ApiError && e.status === 429 ? (e.retryAfterMs ?? 0) : null
}

/** `minMs` es la espera mínima pedida por el servidor; nunca acorta el retroceso. */
function scheduleRetry(minMs = 0) {
  if (!currentUser) return
  const delay = Math.min(RETRY_MAX_MS, Math.max(minMs, RETRY_BASE_MS * 2 ** failures))
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

const isBadRequest = (e: unknown) => e instanceof ApiError && e.status === 400

/** Sube el outbox. Devuelve si algún registro volvió stale (el servidor tiene
 *  algo más nuevo): quien llama entonces baja desde 0. */
async function pushOutbox(): Promise<{ stale: boolean }> {
  let stale = false
  for (const batch of batches(await sdb.getOutbox())) {
    let res: PushResult
    try {
      res = await pushChanges(toPushSet(batch))
    } catch (e) {
      if (!isBadRequest(e)) throw e
      // El servidor rechaza el lote entero por un solo registro malo: se
      // reintenta de a uno para que ese no bloquee a los demás.
      for (const item of batch) if (await pushOne(item)) stale = true
      continue
    }
    if (await settle(batch, res)) stale = true
  }
  return { stale }
}

async function pushOne(item: OutboxEntry): Promise<boolean> {
  try {
    return await settle([item], await pushChanges(toPushSet([item])))
  } catch (e) {
    if (!isBadRequest(e)) throw e
    await sdb.rejectOutboxEntry(item, (e as Error).message)
    return false
  }
}

type PushResult = Awaited<ReturnType<typeof pushChanges>>

/** Quita del outbox lo que el servidor respondió applied o stale. Devuelve si
 *  hubo algún stale. */
async function settle(batch: OutboxEntry[], res: PushResult): Promise<boolean> {
  const answered = new Set<string>()
  let stale = false
  const mark = (entity: Entity, items: ItemResult[] | null | undefined) => {
    for (const r of items ?? []) {
      if (r.status === 'stale') stale = true
      // S15: a stale config is not dropped; the following pull merges it.
      const keep = r.status === 'stale' && entity === 'document' && r.key === 'config'
      if ((r.status === 'applied' || r.status === 'stale') && !keep) answered.add(sdb.outboxId(entity, r.key))
    }
  }
  mark('document', res.documents)
  mark('session', res.sessions)
  mark('measurement', res.measurements)
  mark('exerciseMeta', res.exerciseMeta)
  for (const sent of batch) {
    if (!answered.has(sdb.outboxId(sent.entity, sent.key))) continue
    await sdb.removeRejected(sent.entity, sent.key)
    if (sent.entity === 'document' && sent.key === 'config') await noteConfigSynced(sent.body, sent.updatedAt)
    // Si el registro cambió otra vez mientras se subía, la entrada nueva
    // se queda para la próxima vuelta.
    const now = await sdb.getOutboxEntry(sent.entity, sent.key)
    if (now && now.updatedAt === sent.updatedAt && now.deletedAt === sent.deletedAt) {
      await sdb.removeOutboxEntry(sent.entity, sent.key)
    }
  }
  return stale
}

/* ---------- bajada ---------- */

type Remote = { entity: Entity; key: string; body: unknown; updatedAt: number; deletedAt: number | null }

function remoteRecords(page: ChangeSet): Remote[] {
  return [
    ...(page.documents ?? []).map(d => ({ entity: 'document' as const, key: d.kind, body: d.body, updatedAt: d.updatedAt, deletedAt: d.deletedAt })),
    ...(page.sessions ?? []).map(s => ({ entity: 'session' as const, key: s.id, body: s.body, updatedAt: s.updatedAt, deletedAt: s.deletedAt })),
    ...(page.measurements ?? []).map(m => ({ entity: 'measurement' as const, key: m.date, body: m.body, updatedAt: m.updatedAt, deletedAt: m.deletedAt })),
    ...(page.exerciseMeta ?? []).map(e => ({ entity: 'exerciseMeta' as const, key: e.exerciseId, body: e.body, updatedAt: e.updatedAt, deletedAt: e.deletedAt })),
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
    // A body without the discipline list (older client) never undoes the
    // local list; when there is no local list either, D2-A applies once.
    await db.saveConfig(await withDisciplines(r.body, mergeConfig(r.body), localDisciplines))
    await noteConfigSynced(r.body)
  } else if (r.key === 'plan') {
    const plan = normalizePlan(r.body)
    if (!plan) return false
    await db.savePlan(plan)
  } else return false
  return true
}

/** The list a pulled config without one must keep: the stored local list,
 *  or D2-A from the local sessions when none is stored yet. */
async function localDisciplines() {
  const stored = await db.getConfig()
  if (hasDisciplines(stored)) return mergeConfig(stored).disciplines
  return defaultDisciplines((await db.getSessions()).sessions)
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
    // Lo local pendiente gana hasta que se sube. S15: config is merged instead.
    const pending = await sdb.getOutboxEntry(r.entity, r.key)
    if (pending) {
      if (r.entity === 'document' && r.key === 'config' && (await mergePendingConfig(pending, r))) changed.value = true
      return
    }
    if (await applyRemote(r, true)) changed.value = true
  })
}

/* ---------- primer ingreso (S7) ---------- */

/** Forma comparable de un valor: JSON con las llaves ordenadas. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    isObject(val) ? Object.fromEntries(Object.keys(val).sort().map(k => [k, val[k]])) : val,
  )
}

/** Lo normaliza igual que applyRemote al escribirlo. null = ilegible. */
function normalized(entity: Entity, key: string, body: unknown): unknown {
  if (entity === 'session') {
    const s = normalizeSession(body)
    return s && s.id === key ? s : null
  }
  if (entity === 'document') {
    if (key === 'config') return isObject(body) ? mergeConfig(body) : null
    if (key === 'plan') return normalizePlan(body)
    return null
  }
  return isObject(body) ? body : null
}

/** Seeds by outbox key: values no person chose, normalized like any other
 *  record. Two generations:
 *  - Before the welcome, store.tsx seeded config, plan and the BASELINE
 *    measurement on the first open; older phones still hold them.
 *  - The welcome (features/onboarding) writes the plan of the chosen template
 *    as is. Its config carries the person's own height, goals and block, so
 *    it is real data, not a seed, and it never writes a measurement the
 *    person did not enter. */
function seeds(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (entity: Entity, key: string, body: unknown) => {
    if (body == null) return
    const id = sdb.outboxId(entity, key)
    out.set(id, (out.get(id) ?? new Set<string>()).add(canonical(body)))
  }
  const migration = planMigration(undefined, DEFAULT_CONFIG)
  add('document', 'config', mergeConfig(migration.config ?? DEFAULT_CONFIG))
  add('measurement', BASELINE.date, BASELINE)
  if (migration.plan) add('document', 'plan', normalizePlan(migration.plan))
  for (const t of PLAN_TEMPLATES) add('document', 'plan', normalizePlan(templatePlan(t.id)))
  return out
}

/** Todos los registros locales, normalizados, por llave del outbox. */
async function localRecords(): Promise<Map<string, { entity: Entity; key: string; body: unknown }>> {
  const [{ sessions }, measurements, metas, config, storedPlan] = await Promise.all([
    db.getSessions(),
    db.getMeasurements(),
    db.getExerciseMeta(),
    db.getConfig(),
    db.getPlan(),
  ])
  const out = new Map<string, { entity: Entity; key: string; body: unknown }>()
  const add = (entity: Entity, key: string, body: unknown) => out.set(sdb.outboxId(entity, key), { entity, key, body })
  for (const s of sessions) add('session', s.id, s)
  for (const m of measurements) add('measurement', m.date, m)
  for (const m of metas) add('exerciseMeta', m.exerciseId, m)
  if (config) add('document', 'config', mergeConfig(config))
  const plan = normalizePlan(storedPlan)
  if (plan) add('document', 'plan', plan)
  return out
}

async function bootstrap(uid: string, changed: { value: boolean }) {
  await sdb.updateMeta({ cursor: 0 })
  // Primero se baja todo a memoria (son pocos datos): la copia de seguridad,
  // si hace falta, tiene que hacerse antes de escribir nada remoto.
  const remote = new Map<string, Remote>()
  await pullPages(0, async r => {
    remote.set(sdb.outboxId(r.entity, r.key), r)
  })
  // S15: the server copy is the base of the next config merge, whichever
  // side wins below (a local copy that wins is pushed as a change against it).
  const remoteConfig = remote.get(sdb.outboxId('document', 'config'))
  if (remoteConfig && remoteConfig.deletedAt == null) await noteConfigSynced(remoteConfig.body)

  const local = await localRecords()
  const seeded = seeds()
  // Llaves donde queda la copia del servidor: no se encolan.
  const serverKeeps = new Set<string>()
  const toApply: Remote[] = []
  let conflict = false
  for (const [id, r] of remote) {
    // Una lápida remota no borra nada local en el primer ingreso: si el
    // registro sigue aquí, se vuelve a subir como solo-local.
    if (r.deletedAt != null) continue
    const theirs = normalized(r.entity, r.key, r.body)
    // Ilegible en el servidor: si hay copia local, se sube la local.
    if (theirs === null) continue
    const mine = local.get(id)
    serverKeeps.add(id)
    if (!mine) {
      toApply.push(r)
      continue
    }
    const m = canonical(mine.body)
    const t = canonical(theirs)
    if (m === t) {
      await sdb.removeOutboxEntry(r.entity, r.key)
      continue
    }
    const seed = seeded.get(id)
    if (seed?.has(t)) {
      // El servidor solo tiene la semilla de otro teléfono: gana lo local,
      // que se encola con updatedAt = ahora para pisarla.
      serverKeeps.delete(id)
      continue
    }
    // Si lo local es la semilla gana el servidor sin más; si no, también gana
    // el servidor, pero antes se guarda una copia de lo local.
    if (!seed?.has(m)) conflict = true
    toApply.push(r)
  }

  if (conflict) await sdb.savePreBootstrapBackup(await db.exportBackup())
  for (const r of toApply) {
    await sdb.removeOutboxEntry(r.entity, r.key)
    if (await applyRemote(r, false)) changed.value = true
  }

  await enqueueLocal(serverKeeps)

  // Desde aquí los datos locales son de esta cuenta: si la subida falla, el
  // outbox ya tiene todo y la próxima vuelta es una sincronización normal.
  await sdb.updateMeta({ userId: uid })
  const { stale } = await pushOutbox()
  if (stale) await pullFrom(0, changed)
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

/** Tras restaurar un respaldo: se combina con la cuenta. Todo lo restaurado
 *  pasa a ser lo más nuevo y se sube, y la próxima vuelta baja desde 0 para
 *  recuperar lo que el respaldo no traía. Nada se borra en el servidor. */
export async function enqueueAllLocalChanges() {
  await enqueueLocal(new Set())
  await sdb.updateMeta({ fullPullAt: Date.now() })
  noteLocalWrite()
}

/* ---------- pruebas ---------- */

/** Solo para pruebas: olvida el estado del módulo. */
export function resetSyncEngineForTests() {
  clearTimers()
  if (coldStartTimer) clearTimeout(coldStartTimer)
  coldStartTimer = null
  currentUser = null
  onRemoteChange = null
  inflight = null
  runAgain = false
  failures = 0
  status = IDLE
  listeners.clear()
}
