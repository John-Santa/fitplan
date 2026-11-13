import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Session, SessionKind } from '../../../lib/types'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { DEFAULT_PLAN } from '../../../lib/defaultPlan'
import { DisciplineCtx } from '../../../lib/store'
import { disciplineActions } from '../../../lib/disciplineSelection'
import { todayISO } from '../../../lib/calc'

const today = todayISO()
const gym = { id: 'g', kind: 'strength', routineId: 'a', date: today, startedAt: 1, finishedAt: 2, notes: '', sets: [] } as unknown as Session
const swim = { id: 's', kind: 'swim', date: today, startedAt: 1, finishedAt: 2, notes: '', poolLengthM: 25, rpe: null, blocks: [] } as unknown as Session
const config = { ...DEFAULT_CONFIG, disciplines: ['strength', 'swim'] as SessionKind[], habitCheckIns: [] }

vi.mock('../../../lib/store', async orig => ({
  ...(await orig<typeof import('../../../lib/store')>()),
  useStore: () => ({ sessions: [gym, swim], config, plan: DEFAULT_PLAN, saveConfig: async () => {} }),
}))
vi.mock('../../reminders/components/ReminderSettings', () => ({ ReminderSettings: () => null }))

import Habit from './Habit'

const as = (kind: SessionKind) => {
  const api = disciplineActions({ config, stored: kind, setStored: () => {}, saveConfig: async () => {} })
  return renderToString(<DisciplineCtx.Provider value={api}><Habit /></DisciplineCtx.Provider>).replace(/<!-- -->/g, '')
}

describe('Habit per discipline (S7)', () => {
  it('Natación: Nadado legend and swim votes, no walk legend, intentions kept', () => {
    const out = as('swim')
    expect(out).toContain('Nadado')
    expect(out).toContain('sesión de natación')
    expect(out).not.toContain('Caminata')
    expect(out).toContain('Tu plan de acción')
  })
  it('Gimnasio: Entrenado and Caminata legend, not Hecho, intentions kept', () => {
    const out = as('strength')
    expect(out).toContain('Entrenado')
    expect(out).toContain('Caminata')
    expect(out).not.toContain('Hecho')
    expect(out).not.toContain('Nadado')
    expect(out).toContain('Tu plan de acción')
  })
})
