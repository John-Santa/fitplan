// Guards the hand-written sync types against the API contract: the generated
// schema (pnpm gen:api, from api/openapi.yaml) and syncTypes.ts must name the
// same fields. A drift fails typecheck here, not at runtime against the server.
import { describe, expect, it } from 'vitest'
import type { components } from './api/schema'
import type {
  ChangeSet, DocumentChange, ExerciseMetaChange, ItemResult, MeasurementChange,
  PushChangeSet, PushDocument, PushExerciseMeta, PushMeasurement, PushResult, PushSession, SessionChange,
} from './syncTypes'

type S = components['schemas']
type SameKeys<A, B> = [keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : false) : false
// What the front uploads must only use fields the server accepts (it rejects
// unknown ones); the contract may allow more optional fields than we send.
type SubsetKeys<A, B> = [keyof A] extends [keyof B] ? true : false

const checks: true[] = [
  true as SubsetKeys<PushDocument, S['PushDocument']>,
  true as SubsetKeys<PushSession, S['PushSession']>,
  true as SubsetKeys<PushMeasurement, S['PushMeasurement']>,
  true as SubsetKeys<PushExerciseMeta, S['PushExerciseMeta']>,
  true as SubsetKeys<PushChangeSet, S['PushRequest']>,
  true as SameKeys<DocumentChange, S['Document']>,
  true as SameKeys<SessionChange, S['Session']>,
  true as SameKeys<MeasurementChange, S['Measurement']>,
  true as SameKeys<ExerciseMetaChange, S['ExerciseMeta']>,
  true as SameKeys<ChangeSet, S['PullResponse']>,
  true as SameKeys<ItemResult, S['ItemResult']>,
  true as SameKeys<PushResult, S['PushResponse']>,
]

describe('sync contract', () => {
  it('uploads use only contract fields and downloads match the contract exactly', () => {
    expect(checks.every(Boolean)).toBe(true)
  })
})
