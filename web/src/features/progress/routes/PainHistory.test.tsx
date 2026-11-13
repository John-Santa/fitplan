import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Session } from '../../../lib/types'

const state = vi.hoisted(() => ({ sessions: [] as unknown[] }))

vi.mock('../../../lib/store', () => ({
  useStore: () => ({
    sessions: state.sessions,
    plan: { routines: [], customExercises: [] },
  }),
}))

const { default: PainHistory } = await import('./PainHistory')

const strength = (date: string, pain?: Record<string, number>): Session => ({
  id: date, kind: 'strength', routineId: 'gone', date, startedAt: 1, finishedAt: 2, notes: '', sets: [], pain,
})

describe('PainHistory', () => {
  it('shows the empty state when no pain was recorded', () => {
    state.sessions = [strength('2026-11-17')]
    const html = renderToString(<PainHistory onBack={() => {}} />)
    expect(html).toContain('Todavía no registraste dolor. Aparece aquí cuando lo marques al terminar un ejercicio.')
  })

  it('shows one row per week with value and verdict text, newest first', () => {
    state.sessions = [strength('2026-11-17', { 'deleted-ex': 2 }), strength('2026-11-19', { 'deleted-ex': 4 }), strength('2026-11-10', { 'deleted-ex': 7 })]
    const html = renderToString(<PainHistory onBack={() => {}} />).replace(/<!-- -->/g, '')
    expect(html).toContain('deleted-ex')
    expect(html).toContain('Semana del 16 nov: 4/10 · Baja peso o rango')
    expect(html).toContain('Semana del 9 nov: 7/10 · Cambia el ejercicio')
    expect(html.indexOf('16 nov')).toBeLessThan(html.indexOf('9 nov'))
    expect(html).not.toContain('Todavía no registraste dolor')
  })
})
