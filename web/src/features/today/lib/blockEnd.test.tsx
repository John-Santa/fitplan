// Fin de bloque (F8): estado, comparacion semana 1 vs 12 y arranque de uno nuevo.
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import type { Session, StrengthSession } from '../../../lib/types'
import { DEFAULT_CONFIG } from '../../../lib/plan'
import { blockStatus } from '../../../lib/phases'
import { blockWeekVolume, startNewBlock, weekVolumes } from './blockEnd'
import BlockEndCard from '../components/BlockEndCard'

const strength = (id: string, date: string, weight: number): StrengthSession => ({
  id, kind: 'strength', routineId: 'dia1', date, startedAt: 1, finishedAt: 2, notes: '',
  sets: [{ exerciseId: 'leg-press', setIndex: 0, weight, reps: 10, done: true }],
})

describe('blockStatus', () => {
  const at = (d: string) => new Date(d + 'T12:00:00')
  it('hoy despues de blockEnd el bloque esta terminado', () => {
    expect(blockStatus(at('2027-02-08'), '2026-11-16', '2027-02-07')).toEqual({ state: 'ended', week: 13 })
  })
  it('el dia de blockEnd todavia esta activo, y una fecha futura de inicio es "upcoming"', () => {
    expect(blockStatus(at('2027-02-07'), '2026-11-16', '2027-02-07').state).toBe('active')
    expect(blockStatus(at('2026-11-01'), '2026-11-16', '2027-02-07').state).toBe('upcoming')
  })
})

describe('Home en fin de bloque', () => {
  it('muestra "Bloque terminado" con la comparacion semana 1 vs 12 y el boton de nuevo bloque', () => {
    const sessions: Session[] = [strength('a', '2026-11-17', 100), strength('b', '2027-02-02', 150)]
    const cmp = weekVolumes(sessions, DEFAULT_CONFIG.blockStart, 12)
    const html = renderToString(<BlockEndCard first={cmp.first} last={cmp.last} onStartNew={() => {}} />)
    expect(html).toContain('Bloque terminado')
    expect(html).toContain('Semana 1')
    expect(html).toContain('Semana 12')
    expect(html).toContain('1.000 kg')
    expect(html).toContain('1.500 kg')
    expect(html).toContain('Empezar nuevo bloque')
  })
})

describe('weekVolumes', () => {
  it('suma el volumen de la primera y la ultima semana del bloque', () => {
    const s = [strength('a', '2026-11-16', 100), strength('b', '2026-11-22', 100), strength('c', '2027-02-01', 150), strength('d', '2027-02-08', 999)]
    expect(weekVolumes(s, '2026-11-16', 12)).toEqual({ first: 2000, last: 1500 })
  })
})

describe('blockWeekVolume', () => {
  it('sums one block week and agrees with weekVolumes for weeks 1 and 12', () => {
    const s = [strength('a', '2026-11-16', 100), strength('b', '2026-11-25', 120), strength('c', '2027-02-01', 150)]
    expect(blockWeekVolume(s, '2026-11-16', 2)).toBe(1200)
    expect(blockWeekVolume(s, '2026-11-16', 1)).toBe(weekVolumes(s, '2026-11-16', 12).first)
    expect(blockWeekVolume(s, '2026-11-16', 12)).toBe(weekVolumes(s, '2026-11-16', 12).last)
  })
})

describe('startNewBlock', () => {
  it('escribe fechas nuevas (lunes) de 12 semanas y arrastra las metas y el resto de la config', () => {
    const next = startNewBlock(DEFAULT_CONFIG, new Date('2027-02-10T12:00:00'))
    expect(next.blockStart).toBe('2027-02-15')
    expect(next.blockEnd).toBe('2027-05-09')
    expect(next.goal).toEqual(DEFAULT_CONFIG.goal)
    expect(next.heightCm).toBe(DEFAULT_CONFIG.heightCm)
  })
  it('si hoy es lunes el bloque empieza hoy', () => {
    expect(startNewBlock(DEFAULT_CONFIG, new Date('2027-02-15T12:00:00')).blockStart).toBe('2027-02-15')
  })
  it('un bloque pasado conserva su historial: las sesiones no se tocan', () => {
    const sessions = [strength('a', '2026-11-17', 100)]
    const before = structuredClone(sessions)
    startNewBlock(DEFAULT_CONFIG, new Date('2027-02-10T12:00:00'))
    expect(sessions).toEqual(before)
  })
})
