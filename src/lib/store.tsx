import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Config, ExerciseMeta, Measurement, Session } from '../types'
import * as db from './db'
import { BASELINE, DEFAULT_CONFIG } from './plan'
import { derive } from './calc'

interface Store {
  ready: boolean
  sessions: Session[]
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
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [metaList, setMetaList] = useState<ExerciseMeta[]>([])
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)

  const reload = useCallback(async () => {
    const [s, m, em, c] = await Promise.all([
      db.getSessions(),
      db.getMeasurements(),
      db.getExerciseMeta(),
      db.getConfig(),
    ])
    setSessions(s)
    setMeasurements(m)
    setMetaList(em)
    setConfig(c ?? DEFAULT_CONFIG)
  }, [])

  useEffect(() => {
    ;(async () => {
      const c = await db.getConfig()
      if (!c) {
        // Primera apertura: sembramos la configuracion y la linea base.
        await db.saveConfig(DEFAULT_CONFIG)
        await db.saveMeasurement(BASELINE)
      }
      await reload()
      setReady(true)
    })()
  }, [reload])

  const value = useMemo<Store>(
    () => ({
      ready,
      sessions,
      measurements,
      meta: Object.fromEntries(metaList.map(m => [m.exerciseId, m])),
      config,
      reload,
      saveSession: async s => { await db.saveSession(s); await reload() },
      deleteSession: async id => { await db.deleteSession(id); await reload() },
      saveMeasurement: async m => { await db.saveMeasurement(m); await reload() },
      deleteMeasurement: async d => { await db.deleteMeasurement(d); await reload() },
      saveMeta: async m => { await db.saveExerciseMeta(m); await reload() },
      saveConfig: async c => { await db.saveConfig(c); await reload() },
    }),
    [ready, sessions, measurements, metaList, config, reload],
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
