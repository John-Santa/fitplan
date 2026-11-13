import type { Session, Measurement, ExerciseMeta, Config, Backup, TrainingPlan } from './types'
import { mergeConfig, normalizeSession } from './plan'
import { bySessionTime } from './calc'
import { normalizePlan, planFromBackup } from './planStorage'
import { defaultPlanWithLegacy } from './defaultPlan'
import { migrateLegacyConfig } from './legacyConfig'
import { saveActiveDraft } from '../features/session/lib/activeSession'
import { addLegacyCustomExercises, applyLegacyRoutineExercises, legacyRoutinesUntouched } from './legacyRoutines'
import { defaultDisciplines, withDisciplines } from './disciplineSelection'

const DB_NAME = 'fitplan'
const DB_VERSION = 1
/** Version de respaldo mas alta que este build sabe leer. Ver
 *  checkBackupVersion: 1, 2 y 3 se aceptan, cualquier version mayor se
 *  rechaza con un mensaje real en vez de intentar leerla a ciegas. La 3
 *  agrega el plan de entrenamiento. */
const CURRENT_BACKUP_VERSION = 3

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
          'Esta copia de MagniFit quedó desactualizada respecto a los datos guardados en este dispositivo. ' +
          'Cierra todas las pestañas de MagniFit y vuelve a abrir la aplicación.',
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
        'MagniFit está abierto en otra pestaña o en otro dispositivo con la app instalada, y esta versión ' +
        'necesita que se cierren antes de continuar. Cierra las demás pestañas de MagniFit y vuelve a intentarlo.',
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

/** Runs `work` (which queues requests on the given stores) inside ONE
 *  readwrite transaction: resolves on commit and rejects if any request fails
 *  or `work` throws, in which case IndexedDB discards every queued write. */
function writeAtomically(stores: string[], work: (store: (name: string) => IDBObjectStore) => void): Promise<void> {
  return openDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction(stores, 'readwrite')
        t.oncomplete = () => resolve()
        // A failed request aborts the transaction (nobody calls
        // preventDefault), so onabort is the single failure signal.
        t.onabort = () => reject(t.error ?? new Error('No se pudo guardar el respaldo.'))
        try {
          work(name => t.objectStore(name))
        } catch (e) {
          try { t.abort() } catch { /* already finished */ }
          reject(e)
        }
      }),
  )
}

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
 *  orden por mas reciente (bySessionTime, la fecha de la sesion primero). */
export const getSessions = async (): Promise<SessionsResult> => {
  const raw = await getAll<unknown>(STORE_SESSIONS)
  const sessions: Session[] = []
  let droppedCount = 0
  for (const row of raw) {
    const s = normalizeSession(row)
    if (s) sessions.push(s)
    else droppedCount++
  }
  sessions.sort((a, b) => bySessionTime(b, a))
  return { sessions, droppedCount }
}
export const saveSession = (s: Session) => put(STORE_SESSIONS, s)
export const deleteSession = (id: string) => del(STORE_SESSIONS, id)

/* ---------- medidas ---------- */
export const getMeasurements = () =>
  getAll<Measurement>(STORE_MEASUREMENTS).then(list => list.sort((a, b) => (a.date < b.date ? -1 : 1)))
/** Whole-record put by date: it REPLACES the stored measurement, so a record
 *  with fewer fields drops the rest. Callers that only know some fields (a
 *  weight-only log, a form with empty inputs) go through `mergeMeasurement`. */
export const saveMeasurement = (m: Measurement) => put(STORE_MEASUREMENTS, m)
/** What to store when `patch` is saved over the measurement already stored for
 *  its date: every field of `existing` survives unless `patch` carries it.
 *  Fields a patch leaves out are "not entered", never "cleared". */
export const mergeMeasurement = (existing: Measurement | undefined, patch: Measurement): Measurement => ({
  ...existing,
  ...patch,
})
/** Reads the measurement stored for `patch.date`, merges `patch` over it
 *  (mergeMeasurement) and writes the result in ONE readwrite transaction, so
 *  no other write (a sync-down applying a remote row) can land between the
 *  read and the write. Resolves with the merged record once it is committed. */
export const saveMergedMeasurement = (patch: Measurement): Promise<Measurement> =>
  openDb().then(
    db =>
      new Promise<Measurement>((resolve, reject) => {
        const t = db.transaction(STORE_MEASUREMENTS, 'readwrite')
        const s = t.objectStore(STORE_MEASUREMENTS)
        let merged: Measurement | null = null
        const read = s.get(patch.date) as IDBRequest<Measurement | undefined>
        read.onerror = () => reject(read.error)
        read.onsuccess = () => {
          merged = mergeMeasurement(read.result, patch)
          const write = s.put(merged)
          write.onerror = () => reject(write.error)
        }
        t.oncomplete = () => (merged ? resolve(merged) : reject(new Error('No se pudo guardar la medición.')))
        t.onabort = () => reject(t.error ?? new Error('No se pudo guardar la medición.'))
      }),
  )
export const deleteMeasurement = (date: string) => del(STORE_MEASUREMENTS, date)

/* ---------- notas por ejercicio ---------- */
export const getExerciseMeta = () => getAll<ExerciseMeta>(STORE_EXERCISE_META)
export const saveExerciseMeta = (m: ExerciseMeta) => put(STORE_EXERCISE_META, m)

/* ---------- configuracion ---------- */
export const getConfig = () =>
  tx<Config | undefined>(STORE_CONFIG, 'readonly', s => s.get('config') as IDBRequest<Config | undefined>)
export const saveConfig = (c: Config) => put(STORE_CONFIG, c, 'config')

/* ---------- plan de entrenamiento ---------- */
/** Vive en el almacen `config` bajo la llave 'plan' (llaves externas), asi
 *  que no hace falta subir DB_VERSION. Devuelve lo guardado SIN validar:
 *  undefined = nunca se guardo; normalizePlan decide si es legible. */
export const getPlan = () =>
  tx<unknown>(STORE_CONFIG, 'readonly', s => s.get('plan') as IDBRequest<unknown>)
export const savePlan = (p: TrainingPlan) => put(STORE_CONFIG, p, 'plan')

/** Plan to use for what getPlan returned, and whether the stored one is
 *  damaged. Never saved (undefined) is a normal fresh install; anything stored
 *  that normalizePlan cannot read is damaged, so the app can say that it is
 *  running on the default plan instead of switching to it silently. */
export function resolveStoredPlan(raw: unknown): { plan: TrainingPlan; damaged: boolean } {
  const plan = normalizePlan(raw)
  if (plan) return { plan, damaged: false }
  return { plan: defaultPlanWithLegacy(), damaged: raw !== undefined }
}

/* ---------- respaldo: marca local del ultimo export ---------- */
export const getLastBackupAt = () =>
  tx<number | undefined>(STORE_CONFIG, 'readonly', s => s.get('lastBackupAt') as IDBRequest<number | undefined>)
export const saveLastBackupAt = (ts: number) => put(STORE_CONFIG, ts, 'lastBackupAt')

/* ---------- respaldo ---------- */

/** Compuerta de version, extraida como funcion pura (sin IndexedDB) para que
 *  sea testeable directamente. Acepta 1, 2 y 3; cualquier version mayor se
 *  rechaza con un mensaje real en espanol en vez de intentar leerla — surge
 *  a traves de Settings.tsx, que ya renderiza e.message. Cualquier otra
 *  cosa (version ausente, no numerica, fraccionaria o menor a 1) se trata
 *  como "no es un respaldo de MagniFit": un respaldo real siempre trae
 *  `version` desde que existe este archivo. */
export function checkBackupVersion(version: unknown): void {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('Ese archivo no es un respaldo de MagniFit.')
  }
  if (version > CURRENT_BACKUP_VERSION) {
    throw new Error(
      'Ese respaldo lo hizo una versión más nueva de MagniFit. Actualiza la app antes de restaurarlo.',
    )
  }
}

export async function exportBackup(): Promise<Backup> {
  const [{ sessions }, measurements, exerciseMeta, config, storedPlan] = await Promise.all([
    getSessions(),
    getMeasurements(),
    getExerciseMeta(),
    getConfig(),
    getPlan(),
  ])
  // Solo un plan legible: uno corrupto no se propaga a un respaldo.
  const plan = normalizePlan(storedPlan)
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
    ...(plan ? { plan } : {}),
  }
}

export async function importBackup(data: unknown, mode: 'replace' | 'merge' = 'replace') {
  const b = data as Backup
  if (!b || b.app !== 'fitplan') throw new Error('Ese archivo no es un respaldo de MagniFit.')
  checkBackupVersion(b.version)
  // Normaliza antes de escribir: un respaldo v1 (o mas viejo) queda guardado
  // en la forma v2, asi que exportar -> importar -> exportar es idempotente.
  const sessions = (b.sessions ?? [])
    .map(normalizeSession)
    .filter((s): s is Session => s !== null)
  // Everything the backup writes is decided here, before opening the
  // transaction: a plan or config that cannot be prepared throws with the disk
  // untouched, and the writes below happen in one transaction (all or nothing).
  // Respaldos v1/v2 (o con plan ilegible) no traen plan: se conserva el actual.
  let planToSave: TrainingPlan | null = planFromBackup(b)
  let configToSave: Config | null = null
  if (b.config) {
    // A backup from before the discipline list gets D2-A once, from the
    // sessions this import leaves stored.
    let config = await withDisciplines(b.config, mergeConfig(b.config), async () =>
      defaultDisciplines(mode === 'replace' ? sessions : [...(await getSessions()).sessions, ...sessions]),
    )
    if (!planToSave) {
      // La config de un respaldo sin plan es de antes del plan editable: puede
      // traer la semana dia1..dia3 y el bloque viejo, y la migracion de
      // arranque no vuelve a correr porque ya hay un plan guardado. Se
      // reescribe aqui con la semana del plan que queda activo. Un respaldo
      // v3 con plan trae una config escrita por esta version: se deja igual.
      const stored = normalizePlan(await getPlan())
      const active = stored ?? defaultPlanWithLegacy()
      config = migrateLegacyConfig(config, active.weekTemplate) ?? config
      // Listas del editor anterior (routineExercises). Solo se escribe sobre
      // un plan guardado y legible: si falta o esta corrupto no se escribe
      // desde aqui (el arranque lo maneja). Si las rutinas archivadas siguen
      // como al migrar (dispositivo recien actualizado) toman las listas del
      // respaldo; si ya se editaron, solo se agregan los ejercicios propios
      // que falten para que el historial restaurado los nombre.
      if (stored) {
        const next = legacyRoutinesUntouched(stored)
          ? applyLegacyRoutineExercises(stored, config.routineExercises)
          : addLegacyCustomExercises(stored, config.routineExercises)
        if (next !== stored) planToSave = next
      }
    }
    configToSave = config
  }
  await writeAtomically(
    [STORE_SESSIONS, STORE_MEASUREMENTS, STORE_EXERCISE_META, STORE_CONFIG],
    store => {
      if (mode === 'replace') {
        store(STORE_SESSIONS).clear()
        store(STORE_MEASUREMENTS).clear()
        store(STORE_EXERCISE_META).clear()
      }
      for (const s of sessions) store(STORE_SESSIONS).put(s)
      for (const m of b.measurements ?? []) store(STORE_MEASUREMENTS).put(m)
      for (const m of b.exerciseMeta ?? []) store(STORE_EXERCISE_META).put(m)
      if (configToSave) store(STORE_CONFIG).put(configToSave, 'config')
      if (planToSave) store(STORE_CONFIG).put(planToSave, 'plan')
    },
  )
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

/** Empties the fitplan database and the session draft kept in localStorage
 *  (the workout in progress is user data too). The sync database is not
 *  touched here: eraseLocalCopy (features/sync/lib/erase) combines both. */
export async function wipeAll() {
  await Promise.all([
    clear(STORE_SESSIONS),
    clear(STORE_MEASUREMENTS),
    clear(STORE_EXERCISE_META),
    clear(STORE_CONFIG),
  ])
  saveActiveDraft(null)
}
