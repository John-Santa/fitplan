// Contrato de sincronización con la API (GET/POST /v1/sync). Los tiempos son
// milisegundos desde epoch; `deletedAt` no nulo es una lápida. `rev` lo asigna
// el servidor y solo viene en lo que se baja.
import type { Session } from '../types'

type Stamped = {
  updatedAt: number
  deletedAt: number | null
  rev?: number
}

export type DocumentChange = Stamped & {
  kind: 'plan' | 'config'
  body: unknown
}

export type SessionChange = Stamped & {
  id: string
  body: Session
}

export type MeasurementChange = Stamped & {
  date: string
  body: unknown
}

export type ExerciseMetaChange = Stamped & {
  exerciseId: string
  body: unknown
}

/** Lo que se sube: cambios locales sin cursor. */
export type PushChangeSet = {
  documents: DocumentChange[]
  sessions: SessionChange[]
  measurements: MeasurementChange[]
  exerciseMeta: ExerciseMetaChange[]
}

/** Lo que se baja: cambios desde un cursor, paginados. */
export type ChangeSet = PushChangeSet & {
  cursor: number
  hasMore: boolean
}

export type PushResult = {
  results: unknown[]
}

export type Me = { userId: string }
