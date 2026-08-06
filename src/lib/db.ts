import type { Session, Measurement, ExerciseMeta, Config, Backup } from '../types'
import { mergeConfig } from './plan'

const DB_NAME = 'fitplan'
const DB_VERSION = 1

const STORE_SESSIONS = 'sessions'
const STORE_MEASUREMENTS = 'measurements'
const STORE_EXERCISE_META = 'exerciseMeta'
const STORE_CONFIG = 'config'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const s = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
        s.createIndex('by-date', 'date')
        s.createIndex('by-routine', 'routineId')
      }
      if (!db.objectStoreNames.contains(STORE_MEASUREMENTS)) {
        db.createObjectStore(STORE_MEASUREMENTS, { keyPath: 'date' })
      }
      if (!db.objectStoreNames.contains(STORE_EXERCISE_META)) {
        db.createObjectStore(STORE_EXERCISE_META, { keyPath: 'exerciseId' })
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

const getAll = <T>(store: string) => tx<T[]>(store, 'readonly', s => s.getAll() as IDBRequest<T[]>)
const put = <T>(store: string, value: T, key?: IDBValidKey) =>
  tx(store, 'readwrite', s => s.put(value as any, key))
const del = (store: string, key: IDBValidKey) => tx(store, 'readwrite', s => s.delete(key))
const clear = (store: string) => tx(store, 'readwrite', s => s.clear())

/* ---------- sesiones ---------- */
export const getSessions = () =>
  getAll<Session>(STORE_SESSIONS).then(list => list.sort((a, b) => b.startedAt - a.startedAt))
export const saveSession = (s: Session) => put(STORE_SESSIONS, s)
export const deleteSession = (id: string) => del(STORE_SESSIONS, id)

/* ---------- medidas ---------- */
export const getMeasurements = () =>
  getAll<Measurement>(STORE_MEASUREMENTS).then(list => list.sort((a, b) => (a.date < b.date ? -1 : 1)))
export const saveMeasurement = (m: Measurement) => put(STORE_MEASUREMENTS, m)
export const deleteMeasurement = (date: string) => del(STORE_MEASUREMENTS, date)

/* ---------- notas por ejercicio ---------- */
export const getExerciseMeta = () => getAll<ExerciseMeta>(STORE_EXERCISE_META)
export const saveExerciseMeta = (m: ExerciseMeta) => put(STORE_EXERCISE_META, m)

/* ---------- configuracion ---------- */
export const getConfig = () =>
  tx<Config | undefined>(STORE_CONFIG, 'readonly', s => s.get('config') as IDBRequest<Config | undefined>)
export const saveConfig = (c: Config) => put(STORE_CONFIG, c, 'config')

/* ---------- respaldo: marca local del ultimo export ---------- */
export const getLastBackupAt = () =>
  tx<number | undefined>(STORE_CONFIG, 'readonly', s => s.get('lastBackupAt') as IDBRequest<number | undefined>)
export const saveLastBackupAt = (ts: number) => put(STORE_CONFIG, ts, 'lastBackupAt')

/* ---------- respaldo ---------- */
export async function exportBackup(): Promise<Backup> {
  const [sessions, measurements, exerciseMeta, config] = await Promise.all([
    getSessions(),
    getMeasurements(),
    getExerciseMeta(),
    getConfig(),
  ])
  return {
    app: 'fitplan',
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    measurements,
    exerciseMeta,
    config: config ?? null,
  }
}

export async function importBackup(data: unknown, mode: 'replace' | 'merge' = 'replace') {
  const b = data as Backup
  if (!b || b.app !== 'fitplan') throw new Error('Ese archivo no es un respaldo de FitPlan.')
  if (mode === 'replace') {
    await Promise.all([clear(STORE_SESSIONS), clear(STORE_MEASUREMENTS), clear(STORE_EXERCISE_META)])
  }
  await Promise.all([
    ...(b.sessions ?? []).map(s => saveSession(s)),
    ...(b.measurements ?? []).map(m => saveMeasurement(m)),
    ...(b.exerciseMeta ?? []).map(m => saveExerciseMeta(m)),
  ])
  if (b.config) await saveConfig(mergeConfig(b.config))
}

export async function wipeAll() {
  await Promise.all([
    clear(STORE_SESSIONS),
    clear(STORE_MEASUREMENTS),
    clear(STORE_EXERCISE_META),
    clear(STORE_CONFIG),
  ])
}
