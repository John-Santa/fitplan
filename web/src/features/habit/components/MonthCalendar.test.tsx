import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Session } from '../../../lib/types'
import type { ReactNode } from 'react'
import type { SessionKind } from '../../../lib/types'
import { DisciplineCtx } from '../../../lib/store'
import { disciplineActions } from '../../../lib/disciplineSelection'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { MonthCalendar } from './MonthCalendar'

const as = (kind: SessionKind, node: ReactNode) => {
  const api = disciplineActions({
    config: { ...DEFAULT_CONFIG, disciplines: ['strength', 'swim'] }, stored: kind,
    setStored: () => {}, saveConfig: async () => {},
  })
  return <DisciplineCtx.Provider value={api}>{node}</DisciplineCtx.Provider>
}

const sessions = [
  { id: 'a', kind: 'strength', routineId: 'r', date: '2026-11-10', startedAt: 1, finishedAt: 2, notes: '', sets: [] },
  { id: 'b', kind: 'swim', date: '2026-11-12', startedAt: 1, finishedAt: 2, notes: '' },
] as unknown as Session[]

const html = (today = '2026-11-12', kind: SessionKind = 'strength') =>
  renderToString(as(kind, <MonthCalendar sessions={sessions} checkIns={['2026-11-12']} today={today} />)).replace(/<!-- -->/g, '')

describe('MonthCalendar', () => {
  it('Gimnasio shows the legend and day labels of gym and walks only', () => {
    const out = html()
    for (const label of ['Fuerza', 'Caminata']) expect(out).toContain(label)
    expect(out).not.toContain('Natación')
    expect(out).toContain('jueves 12 de noviembre: caminata')
    expect(out).toContain('martes 10 de noviembre: fuerza')
  })

  it('Natación shows only swims: no walk, no strength, legend with Natación only', () => {
    const out = html('2026-11-12', 'swim')
    expect(out).toContain('jueves 12 de noviembre: natación')
    expect(out).not.toContain('caminata')
    expect(out).not.toContain('fuerza')
    expect(out).toContain('Natación')
    expect(out).not.toContain('Fuerza')
    expect(out).not.toContain('Caminata')
  })

  it('disables next month on the current month and keeps previous enabled', () => {
    const out = html()
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Mes siguiente/)
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>Mes anterior/)
  })
})
