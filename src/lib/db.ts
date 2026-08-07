import type { Session, Measurement, ExerciseMeta, Config, Backup } from '../types'
import { mergeConfig, normalizeSession } from './plan'

const DB_NAME = 'fitplan'
const DB_VERSION = 1
/** Version de respaldo mas alta que este build sabe leer. Ver
 *  checkBackupVersion: 1 y 2 se aceptan, cualquier version mayor se rechaza
 *  con un mensaje real en vez de intentar leerla a ciegas. */
const CURRENT_BACKUP_VERSION = 2

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
        // Ninguno de los dos indices se consulta en ningun lado (getSessions
        // usa getAll() y ordena en memoria). by-routine ademas es inseguro
        // para un almacen discriminado desde A1: IndexedDB omite en
        // silencio los registros cuyo keyPath no resuelve, asi que una
        // SwimSession (sin routineId) simplemente no aparece en ese indice
        // (R8). Correcto por accidente hoy porque nada lo consulta; se
        // documenta en vez de borrarlo porque quitarlo exigiria una
        // transaccion de actualizacion de version, y no lo vale.
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
    req.onsuccess = () => {
      const db = req.result
      // Cede el paso ante una conexion mas nueva (otra pestana, o esta misma
      // PWA actualizada en otra ventana) en vez de bloquearla para siempre:
      // sin esto, un futuro cambio de DB_VERSION dejaria a esa otra conexion
      // colgada en onblocked de por vida.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => {
      const err = req.error
      if (err?.name === 'VersionError') {
        // Un bundle viejo intento abrir una base que ya quedo en una version
        // mas nueva (escrita por otra pestana con el codigo actualizado).
        reject(new Error(
          'Esta copia de FitPlan quedó desactualizada respecto a los datos guardados en este dispositivo. ' +
          'Cierra todas las pestañas de FitPlan y vuelve a abrir la aplicación.',
        ))
        return
      }
      reject(err ?? new Error('No se pudo abrir la base de datos.'))
    }
    // Se dispara cuando otra conexion (otra pestana, o la PWA instalada
    // corriendo en paralelo) sigue abierta y no cede el paso a un futuro
    // cambio de version. Sin este manejador la promesa jamas se resuelve ni
    // se rechaza, y la aplicacion queda en "Cargando..." para siempre.
    req.onblocked = () => {
      reject(new Error(
        'FitPlan está abierto en otra pestaña o en otro dispositivo con la app instalada, y esta versión ' +
        'necesita que se cierren antes de continuar. Cierra las demás pestañas de FitPlan y vuelve a intentarlo.',
      ))
    }
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

/** sessions ya normalizadas y ordenadas; droppedCount cuenta las filas que
 *  normalizeSession no pudo leer (kind desconocido, forma corrupta). Nunca
 *  se borran del disco, solo se excluyen de memoria — Ajustes usa
 *  droppedCount para avisar en vez de hacer desaparecer historial en
 *  silencio. */
export interface SessionsResult {
  sessions: Session[]
  droppedCount: number
}

/** Unico camino de lectura de sesiones (tambien lo usa exportBackup, mas
 *  abajo): getAll<unknown> porque una fila en disco puede venir de una
 *  version anterior del codigo, .map(normalizeSession) para decidir que
 *  forma tiene, filtro para descartar lo irrecuperable (y contarlo), y
 *  orden por mas reciente. */
export const getSessions = async (): Promise<SessionsResult> => {
  const raw = await getAll<unknown>(STORE_SESSIONS)
  const sessions: Session[] = []
  let droppedCount = 0
  for (const row of raw) {
    const s = normalizeSession(row)
    if (s) sessions.push(s)
    else droppedCount++
  }
  sessions.sort((a, b) => b.startedAt - a.startedAt)
  return { sessions, droppedCount }
}
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

/** Compuerta de version, extraida como funcion pura (sin IndexedDB) para que
 *  sea testeable directamente. Acepta 1 y 2; cualquier version mayor se
 *  rechaza con un mensaje real en espanol en vez de intentar leerla — surge
 *  a traves de Settings.tsx, que ya renderiza e.message. Cualquier otra
 *  cosa (version ausente, no numerica, fraccionaria o menor a 1) se trata
 *  como "no es un respaldo de FitPlan": un respaldo real siempre trae
 *  `version` desde que existe este archivo. */
export function checkBackupVersion(version: unknown): void {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('Ese archivo no es un respaldo de FitPlan.')
  }
  if (version > CURRENT_BACKUP_VERSION) {
    throw new Error(
      'Ese respaldo lo hizo una versión más nueva de FitPlan. Actualiza la app antes de restaurarlo.',
    )
  }
}

export async function exportBackup(): Promise<Backup> {
  const [{ sessions }, measurements, exerciseMeta, config] = await Promise.all([
    getSessions(),
    getMeasurements(),
    getExerciseMeta(),
    getConfig(),
  ])
  return {
    app: 'fitplan',
    version: CURRENT_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
    measurements,
    exerciseMeta,
    // mergeConfig(config), no el valor guardado tal cual: sin esto, un
    // respaldo podia contener sesiones ya normalizadas (forma v2) junto a
    // una config sin reparar, internamente inconsistente. Con esto,
    // exportar -> importar es idempotente.
    config: config ? mergeConfig(config) : null,
  }
}

export async function importBackup(data: unknown, mode: 'replace' | 'merge' = 'replace') {
  const b = data as Backup
  if (!b || b.app !== 'fitplan') throw new Error('Ese archivo no es un respaldo de FitPlan.')
  checkBackupVersion(b.version)
  // Normaliza antes de escribir: un respaldo v1 (o mas viejo) queda guardado
  // en la forma v2, asi que exportar -> importar -> exportar es idempotente.
  const sessions = (b.sessions ?? [])
    .map(normalizeSession)
    .filter((s): s is Session => s !== null)
  if (mode === 'replace') {
    await Promise.all([clear(STORE_SESSIONS), clear(STORE_MEASUREMENTS), clear(STORE_EXERCISE_META)])
  }
  await Promise.all([
    ...sessions.map(s => saveSession(s)),
    ...(b.measurements ?? []).map(m => saveMeasurement(m)),
    ...(b.exerciseMeta ?? []).map(m => saveExerciseMeta(m)),
  ])
  if (b.config) await saveConfig(mergeConfig(b.config))
}

/** Dispara la descarga de un respaldo ya generado: Blob + URL de objeto +
 *  ancla sintetica con click(). Es la parte de doExport (Settings.tsx) sin
 *  efectos de UI (toast, marca de "ultimo respaldo"), asi que tambien la usan
 *  las pantallas de error que no dependen de la tienda ni de sus componentes:
 *  ErrorScreen (P0-1: fallo al abrir la base) y ErrorBoundary (P0-2: fallo de
 *  render). Una sola implementacion, en vez de duplicar el patron. */
export function downloadBackupFile(data: Backup): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `fitplan-${data.exportedAt.slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export async function wipeAll() {
  await Promise.all([
    clear(STORE_SESSIONS),
    clear(STORE_MEASUREMENTS),
    clear(STORE_EXERCISE_META),
    clear(STORE_CONFIG),
  ])
}
