import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Session } from '../../../lib/types'
import { MonthCalendar } from './MonthCalendar'

const sessions = [
  { id: 'a', kind: 'strength', routineId: 'r', date: '2026-11-10', startedAt: 1, finishedAt: 2, notes: '', sets: [] },
  { id: 'b', kind: 'swim', date: '2026-11-12', startedAt: 1, finishedAt: 2, notes: '' },
] as unknown as Session[]

const html = (today = '2026-11-12') =>
  renderToString(<MonthCalendar sessions={sessions} checkIns={['2026-11-12']} today={today} />).replace(/<!-- -->/g, '')

describe('MonthCalendar', () => {
  it('shows the legend and accessible day labels', () => {
    const out = html()
    for (const label of ['Fuerza', 'Natación', 'Caminata']) expect(out).toContain(label)
    expect(out).toContain('jueves 12 de noviembre: natación, caminata')
    expect(out).toContain('martes 10 de noviembre: fuerza')
  })

  it('disables next month on the current month and keeps previous enabled', () => {
    const out = html()
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Mes siguiente/)
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>Mes anterior/)
  })
})
