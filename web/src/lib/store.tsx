import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Config, ExerciseMeta, Measurement, Session, TrainingPlan } from './types'
import * as db from './db'
import { DEFAULT_CONFIG, mergeConfig } from './plan'
import { derive } from './calc'
import { defaultPlanWithLegacy } from './defaultPlan'
import { applyPlanMigration } from './migration'
import { authEnabled, useAuthState } from '../features/account/lib/auth'
import * as local from '../features/sync/lib/localWrites'
import { useSyncTriggers } from '../features/sync/lib/useSync'

interface Store {
  ready: boolean
  /** Motivo por el que la base de datos no pudo abrirse (P0-1: bloqueo por
   *  otra conexion, o VersionError). null mientras todo va bien. Si esta
   *  poblado, ready se queda en false para siempre y App.tsx debe mostrar un
   *  estado de error real en vez de "Cargando..." eterno. */
  dbError: string | null
  /** No config is stored yet: a new install that must go through the welcome
   *  (features/onboarding) before the app. Nothing is written for it until
   *  the welcome finishes; the config it saves last ends this state. */
  needsOnboarding: boolean
  /** Runs the local boot again and reloads (after restoring a backup from
   *  the welcome, so the restored config is completed and migrated). */
  restart: () => Promise<void>
  sessions: Session[]
  /** Cuantas filas de `sessions` no se pudieron leer en la ultima carga
   *  (normalizeSession las descarto: kind desconocido o forma corrupta).
   *  Nunca se borran del disco, solo se excluyen de memoria. Ajustes lo usa
   *  para avisar "N sesiones no se pudieron leer" en vez de hacer
   *  desaparecer historial en silencio. */
  droppedSessionCount: number
  measurements: Measurement[]
  meta: Record<string, ExerciseMeta>
  config: Config
  reload: () => Promise<void>
  saveSession: (s: Session) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  saveMeasurement: (m: Measurement) => Promise<void>
  deleteMeasurement: (date: string) => Promise<void>
  saveMeta: (m: ExerciseMeta) => Promise<void>
  saveConfig: (c: Config) => Promise<void>
  /** Plan de entrenamiento activo, editable. Incluye las rutinas archivadas:
   *  quien muestre opciones para elegir filtra `archived`. */
  plan: TrainingPlan
  /** Reemplaza el plan completo y lo persiste. */
  savePlan: (p: TrainingPlan) => Promise<void>
  /** El plan guardado en este dispositivo no se pudo leer y se usa el plan
   *  por defecto en memoria. Se apaga al guardar un plan o restaurar un
   *  respaldo con plan. Ajustes lo muestra en vez de cambiar de plan en
   *  silencio. */
  planDamaged: boolean
}

const Ctx = createContext<Store | null>(null)

/** Local boot that StoreProvider runs on mount, before the first reload.
 *  Without a stored config (new install) it writes nothing and reports that
 *  the welcome is needed: the person sets up their own profile instead of
 *  inheriting a seeded one. With a stored config (existing install) it does
 *  exactly what it always did: complete the config written by an older
 *  version and run the one-time plan migration. */
export async function prepareLocalData(): Promise<{ needsOnboarding: boolean }> {
  const stored = await db.getConfig()
  if (!stored) return { needsOnboarding: true }
  // Config escrita por una version anterior: la completamos y la
  // reescribimos una sola vez. La comparacion por JSON es un chequeo de
  // idempotencia barato, no un contrato de igualdad profunda: si el orden
  // de claves difiere se reescribe una vez y a partir de ahi coincide.
  const current = mergeConfig(stored)
  if (JSON.stringify(stored) !== JSON.stringify(current)) await db.saveConfig(current)
  // Migracion unica al plan editable (S5): solo escribe el registro del
  // plan y, si la semana o el bloque son los de antes, la config.
  await applyPlanMigration(current)
  return { needsOnboarding: false }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [droppedSessionCount, setDroppedSessionCount] = useState(0)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [metaList, setMetaList] = useState<ExerciseMeta[]>([])
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  // Lo guardado bajo la llave 'plan'; si falta o es ilegible, el plan por
  // defecto (en memoria hasta que la persona lo edite).
  const [plan, setPlan] = useState<TrainingPlan>(defaultPlanWithLegacy)
  const [planDamaged, setPlanDamaged] = useState(false)

  const reload = useCallback(async () => {
    const [sessionsResult, m, em, c, p] = await Promise.all([
      db.getSessions(),
      db.getMeasurements(),
      db.getExerciseMeta(),
      db.getConfig(),
      db.getPlan(),
    ])
    setSessions(sessionsResult.sessions)
    setDroppedSessionCount(sessionsResult.droppedCount)
    setMeasurements(m)
    setMetaList(em)
    setConfig(mergeConfig(c))
    // The config is the welcome's last write, and a first sync that brings
    // the account's config also ends the welcome.
    setNeedsOnboarding(!c)
    const resolved = db.resolveStoredPlan(p)
    setPlan(resolved.plan)
    setPlanDamaged(resolved.damaged)
  }, [])

  const restart = useCallback(async () => {
    await prepareLocalData()
    await reload()
  }, [reload])

  useEffect(() => {
    ;(async () => {
      try {
        await restart()
        setReady(true)
      } catch (e) {
        // P0-1: sin este catch, un rechazo de openDb (base bloqueada por otra
        // conexion, o VersionError) dejaba esta promesa colgada sin manejar y
        // "ready" en false para siempre: "Cargando..." eterno y sin mensaje.
        setDbError(e instanceof Error ? e.message : 'No se pudo abrir la base de datos.')
      }
    })()
  }, [restart])

  // Sincronización (S6/S7): solo con login habilitado y sesión iniciada, y
  // después del arranque local (completar config + migración) para no subir a
  // medias. También corre durante la bienvenida: si la cuenta ya tiene datos,
  // la primera bajada trae su config y eso termina la bienvenida.
  const auth = useAuthState()
  useSyncTriggers(authEnabled && auth.isSignedIn ? auth.userId : null, ready, reload)

  const value = useMemo<Store>(
    () => ({
      ready,
      dbError,
      needsOnboarding,
      restart,
      sessions,
      droppedSessionCount,
      measurements,
      meta: Object.fromEntries(metaList.map(m => [m.exerciseId, m])),
      config,
      reload,
      // localWrites guarda en IndexedDB y además deja el cambio en el outbox
      // de sincronización (no hace nada extra con el login deshabilitado).
      saveSession: async s => { await local.saveSession(s); await reload() },
      deleteSession: async id => { await local.deleteSession(id); await reload() },
      saveMeasurement: async m => { await local.saveMeasurement(m); await reload() },
      deleteMeasurement: async d => { await local.deleteMeasurement(d); await reload() },
      saveMeta: async m => { await local.saveExerciseMeta(m); await reload() },
      // The edit is applied over the stored config: a sync may have merged
      // another device's changes into it since `config` was read (S15).
      saveConfig: async c => { await local.saveConfigEdit(config, c); await reload() },
      plan,
      savePlan: async p => { await local.savePlan(p); setPlan(p); setPlanDamaged(false) },
      planDamaged,
    }),
    [ready, dbError, needsOnboarding, restart, sessions, droppedSessionCount, measurements, metaList, config, reload, plan, planDamaged],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fuera de StoreProvider')
  return s
}

/** Medidas con los valores derivados ya calculados, ordenadas por fecha. */
export function useDerivedMeasurements() {
  const { measurements, config } = useStore()
  return useMemo(
    () => measurements.map(m => derive(m, config.heightCm)),
    [measurements, config.heightCm],
  )
}
