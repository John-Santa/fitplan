// "Nueva medición" on a date that already has a measurement (S9): the form
// shows that date's stored values and what is on screen is what is saved.
// The save path goes through the real local write (db + outbox) on the
// in-memory IndexedDB.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMemoryIdb, type MemoryIdb } from '../../../lib/testing/memoryIdb'
import type { Measurement } from '../../../lib/types'
import { formForDate, measurementFromForm } from './measureForm'

vi.setConfig({ testTimeout: 30_000 })

const STORED: Measurement = { date: '2026-11-12', weight: 80, fatPct: 20, waist: 90 }

describe('formForDate', () => {
  it('prefills the form with the measurement stored for that date', () => {
    expect(formForDate('2026-11-12', [STORED])).toEqual({ date: '2026-11-12', weight: '80', fatPct: '20', waist: '90' })
  })

  it('opens empty on a date with nothing stored', () => {
    expect(formForDate('2026-11-13', [STORED])).toEqual({ date: '2026-11-13' })
  })

  it('moving to a stored date shows that date, not what was typed', () => {
    expect(formForDate('2026-11-12', [STORED], { date: '2026-11-13', weight: '79' })).toEqual(formForDate('2026-11-12', [STORED]))
  })

  it('moving from a stored date to a new one clears the values it showed', () => {
    expect(formForDate('2026-11-13', [STORED], formForDate('2026-11-12', [STORED]))).toEqual({ date: '2026-11-13' })
  })

  it('moving between two new dates keeps what was typed', () => {
    expect(formForDate('2026-11-14', [STORED], { date: '2026-11-13', weight: '79' })).toEqual({ date: '2026-11-14', weight: '79' })
  })
})

describe('measurementFromForm', () => {
  it('is exactly what is on screen: an emptied field is left out', () => {
    const form = { ...formForDate('2026-11-12', [STORED]), waist: '' }
    expect(measurementFromForm(form)).toEqual({ date: '2026-11-12', weight: 80, fatPct: 20 })
  })

  it('needs a date and a numeric weight', () => {
    expect(measurementFromForm({ date: '2026-11-12', weight: '' })).toBeNull()
    expect(measurementFromForm({ date: '', weight: '80' })).toBeNull()
    expect(measurementFromForm({ date: '2026-11-12', weight: 'x' })).toBeNull()
  })

  it('ignores a field that is not a number', () => {
    expect(measurementFromForm({ date: '2026-11-12', weight: '80', waist: 'abc' })).toEqual({ date: '2026-11-12', weight: 80 })
  })
})

describe('saving the form over a stored measurement', () => {
  type Env = {
    local: typeof import('../../sync/lib/localWrites')
    idb: MemoryIdb
  }
  let e: Env
  beforeEach(async () => {
    vi.resetModules()
    const idb = installMemoryIdb()
    const local = await import('../../sync/lib/localWrites')
    local.setTrackingForTests(true)
    e = { local, idb }
    await local.saveMeasurement(STORED)
  })
  const stored = () => e.idb.dump('measurements', 'fitplan').get('2026-11-12')
  const queued = () =>
    (e.idb.dump('outbox', 'magnifit-sync').get('measurement:2026-11-12') as { body: unknown; deletedAt: number | null } | undefined)

  it('clearing waist and saving stores the record without waist and queues that body', async () => {
    const m = measurementFromForm({ ...formForDate('2026-11-12', [STORED]), waist: '' })
    await e.local.saveMeasurement(m!)
    expect(stored()).toEqual({ date: '2026-11-12', weight: 80, fatPct: 20 })
    expect(queued()).toMatchObject({ body: { date: '2026-11-12', weight: 80, fatPct: 20 }, deletedAt: null })
    expect((queued()?.body as Record<string, unknown>).waist).toBeUndefined()
  })

  it('a weight-only save from Hoy (QuickWeight) still merges and keeps every field', async () => {
    await e.local.mergeMeasurement({ date: '2026-11-12', weight: 79 })
    expect(stored()).toEqual({ date: '2026-11-12', weight: 79, fatPct: 20, waist: 90 })
    expect(queued()?.body).toEqual({ date: '2026-11-12', weight: 79, fatPct: 20, waist: 90 })
  })
})
