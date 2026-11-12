// F7: editar una sesion terminada desde el detalle.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StrengthSession } from '../../../lib/types'
import { sessionVolume } from '../../../lib/calc'
import { installMemoryIdb } from '../../../lib/testing/memoryIdb'
import { applySessionEdit } from './editSession'

const original: StrengthSession = {
  id: 's1', kind: 'strength', routineId: 'dia1', date: '2026-11-17', startedAt: 1000, finishedAt: 5000, notes: '',
  sets: [
    { exerciseId: 'leg-press', setIndex: 0, weight: 80, reps: 10, done: true },
    { exerciseId: 'leg-press', setIndex: 1, weight: 80, reps: 10, done: true },
  ],
}

describe('applySessionEdit', () => {
  it('cambiar el peso de una serie recalcula el volumen y conserva finishedAt', () => {
    const edited: StrengthSession = { ...original, sets: [{ ...original.sets[0], weight: 90 }, original.sets[1]] }
    const saved = applySessionEdit(original, { ...edited, finishedAt: 99999 })
    expect(sessionVolume(saved as StrengthSession)).toBe(90 * 10 + 80 * 10)
    expect(saved.finishedAt).toBe(5000)
    expect(saved.id).toBe('s1')
  })
})

describe('guardar edicion y eliminar sesion contra IndexedDB', () => {
  beforeEach(() => { vi.resetModules(); installMemoryIdb() })

  it('saveSession actualiza por id, sin duplicar', async () => {
    const db = await import('../../../lib/db')
    await db.saveSession(original)
    await db.saveSession(applySessionEdit(original, { ...original, sets: [{ ...original.sets[0], weight: 90 }] }))
    const { sessions } = await db.getSessions()
    expect(sessions).toHaveLength(1)
    expect(sessionVolume(sessions[0] as StrengthSession)).toBe(900)
  })

  it('eliminar sesion sigue quitandola del historial', async () => {
    const db = await import('../../../lib/db')
    await db.saveSession(original)
    await db.deleteSession('s1')
    expect((await db.getSessions()).sessions).toHaveLength(0)
  })
})
