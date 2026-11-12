import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Config, ExerciseMeta, Measurement, Session, TrainingPlan } from './types'
import * as db from './db'
import { BASELINE, DEFAULT_CONFIG, mergeConfig } from './plan'
import { derive } from './calc'
import { defaultPlanWithLegacy } from './defaultPlan'
import { applyPlanMigration } from './migration'
import { normalizePlan } from './planStorage'
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
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [droppedSessionCount, setDroppedSessionCount] = useState(0)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [metaList, setMetaList] = useState<ExerciseMeta[]>([])
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  // Lo guardado bajo la llave 'plan'; si falta o es ilegible, el plan por
  // defecto (en memoria hasta que la persona lo edite).
  const [plan, setPlan] = useState<TrainingPlan>(defaultPlanWithLegacy)

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
    setPlan(normalizePlan(p) ?? defaultPlanWithLegacy())
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const stored = await db.getConfig()
        let current = DEFAULT_CONFIG
        if (!stored) {
          // Primera apertura: sembramos la configuracion y la linea base.
          await db.saveConfig(DEFAULT_CONFIG)
          await db.saveMeasurement(BASELINE)
        } else {
          // Config escrita por una version anterior: la completamos y la
          // reescribimos una sola vez. La comparacion por JSON es un chequeo de
          // idempotencia barato, no un contrato de igualdad profunda: si el orden
          // de claves difiere se reescribe una vez y a partir de ahi coincide.
          current = mergeConfig(stored)
          if (JSON.stringify(stored) !== JSON.stringify(current)) await db.saveConfig(current)
        }
        // Migracion unica al plan editable (S5): solo escribe el registro del
        // plan y, si la semana o el bloque son los de antes, la config.
        await applyPlanMigration(current)
        await reload()
        setReady(true)
      } catch (e) {
        // P0-1: sin este catch, un rechazo de openDb (base bloqueada por otra
        // conexion, o VersionError) dejaba esta promesa colgada sin manejar y
        // "ready" en false para siempre: "Cargando..." eterno y sin mensaje.
        setDbError(e instanceof Error ? e.message : 'No se pudo abrir la base de datos.')
      }
    })()
  }, [reload])

  // Sincronización (S6/S7): solo con login habilitado y sesión iniciada, y
  // después del arranque local (seed + migración) para no subir a medias.
  const auth = useAuthState()
  useSyncTriggers(authEnabled && auth.isSignedIn ? auth.userId : null, ready, reload)

  const value = useMemo<Store>(
    () => ({
      ready,
      dbError,
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
      savePlan: async p => { await local.savePlan(p); setPlan(p) },
    }),
    [ready, dbError, sessions, droppedSessionCount, measurements, metaList, config, reload, plan],
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
