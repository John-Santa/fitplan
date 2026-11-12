import { describe, expect, it } from 'vitest'
import type { LibraryExercise } from './types'
import { musclewikiLinkLabel, musclewikiUrl } from './musclewiki'

const base: LibraryExercise = {
  id: 'x',
  name: 'Máquina de espalda baja',
  category: 'strength',
  equipment: 'Máquina',
  primaryMuscles: [],
  secondaryMuscles: [],
  steps: [],
  cues: [],
  musclewiki: { slug: null, id: null },
}

describe('musclewikiUrl', () => {
  it('apunta a la ficha en español cuando hay slug verificado', () => {
    const ex = { ...base, musclewiki: { slug: 'cable-rope-hammer-curl', id: null } }
    expect(musclewikiUrl(ex)).toBe('https://musclewiki.com/es-es/exercise/cable-rope-hammer-curl')
  })

  it('sin slug abre una busqueda restringida al sitio, con el nombre codificado', () => {
    expect(musclewikiUrl(base)).toBe(
      'https://www.google.com/search?q=site%3Amusclewiki.com%20M%C3%A1quina%20de%20espalda%20baja',
    )
  })
})

describe('musclewikiLinkLabel', () => {
  it('dice ver video cuando hay slug', () => {
    const ex = { ...base, musclewiki: { slug: 'leg-press', id: null } }
    expect(musclewikiLinkLabel(ex)).toBe('Ver video en MuscleWiki')
  })

  it('dice buscar cuando no hay slug', () => {
    expect(musclewikiLinkLabel(base)).toBe('Buscar en MuscleWiki')
  })
})
