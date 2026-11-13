import { describe, expect, it } from 'vitest'
import { DISCIPLINE_CATALOG } from '../lib/disciplineSelection'
import { DISCIPLINE_META, disciplineName, streakLabel } from './disciplineMeta'

describe('disciplineMeta', () => {
  it('names every catalog discipline and gives it an icon', () => {
    expect(disciplineName('strength')).toBe('Gimnasio')
    expect(disciplineName('swim')).toBe('Natación')
    for (const k of DISCIPLINE_CATALOG) {
      expect(DISCIPLINE_META[k].iconPath.length).toBeGreaterThan(0)
    }
  })

  it('formats the streak in singular and plural', () => {
    expect(streakLabel(12)).toBe('Racha: 12 días')
    expect(streakLabel(1)).toBe('Racha: 1 día')
    expect(streakLabel(0)).toBe('Racha: 0 días')
  })
})
