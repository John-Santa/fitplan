// Contrato de sincronización con la API (GET/POST /v1/sync), igual al formato
// de api/internal/http/v1.go. Los tiempos son milisegundos desde epoch;
// `deletedAt` no nulo es una lápida y aun así lleva `body` (el servidor lo
// exige: una sesión borrada necesita `kind` y `date`). `rev` lo asigna el
// servidor y solo viene en lo que se baja: lo que se sube lleva exactamente
// los campos de Push*, porque el servidor rechaza campos desconocidos.

type PushStamp = {
  updatedAt: number
  deletedAt: number | null
}

type PullStamp = PushStamp & { rev: number }

export type DocumentKind = 'plan' | 'config'

export type PushDocument = PushStamp & { kind: DocumentKind; body: unknown }
export type PushSession = PushStamp & { id: string; body: unknown }
export type PushMeasurement = PushStamp & { date: string; body: unknown }
export type PushExerciseMeta = PushStamp & { exerciseId: string; body: unknown }

export type DocumentChange = PushDocument & PullStamp
export type SessionChange = PushSession & PullStamp
export type MeasurementChange = PushMeasurement & PullStamp
export type ExerciseMetaChange = PushExerciseMeta & PullStamp

/** Lo que se sube: cambios locales, sin rev ni cursor. */
export type PushChangeSet = {
  documents: PushDocument[]
  sessions: PushSession[]
  measurements: PushMeasurement[]
  exerciseMeta: PushExerciseMeta[]
}

/** Lo que se baja: cambios con rev > since, paginados por cursor. */
export type ChangeSet = {
  documents: DocumentChange[]
  sessions: SessionChange[]
  measurements: MeasurementChange[]
  exerciseMeta: ExerciseMetaChange[]
  cursor: number
  hasMore: boolean
}

/** applied = se escribió y tiene rev nuevo; stale = el servidor tiene una
 *  copia más nueva (gana la última escritura) y no se tocó nada. */
export type ItemResult = {
  key: string
  status: 'applied' | 'stale'
  rev: number
}

/** Un resultado por registro subido, en el mismo orden. */
export type PushResult = {
  documents: ItemResult[]
  sessions: ItemResult[]
  measurements: ItemResult[]
  exerciseMeta: ItemResult[]
}

export type Me = { userId: string }
