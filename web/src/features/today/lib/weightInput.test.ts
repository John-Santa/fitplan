import { describe, expect, it } from 'vitest'
import { lastWeight, parseWeight, WEIGHT_ERROR } from './weightInput'

describe('parseWeight', () => {
  it('reads a decimal weight, with a point or a comma', () => {
    expect(parseWeight('79.5')).toBe(79.5)
    expect(parseWeight(' 79,5 ')).toBe(79.5)
    expect(parseWeight('80')).toBe(80)
  })

  it.each(['', '   ', '0', '0.0', '-3', 'abc', '79kg', 'NaN', 'Infinity'])('rejects %j', text => {
    expect(parseWeight(text)).toBeNull()
  })

  it('has the error copy of the spec', () => {
    expect(WEIGHT_ERROR).toBe('Escribe tu peso en kg')
  })
})

describe('lastWeight', () => {
  it('is the weight of the latest measurement, as the text the input shows', () => {
    expect(lastWeight([{ date: '2026-11-01', weight: 81 }, { date: '2026-11-08', weight: 79.5 }])).toBe('79.5')
  })

  it('is empty when nothing was recorded yet', () => {
    expect(lastWeight([])).toBe('')
  })
})
