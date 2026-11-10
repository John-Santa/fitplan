// Enlaces a MuscleWiki. Puro: sin React ni red.
import type { LibraryExercise } from '../types'

const SITE = 'https://musclewiki.com/es-es/exercise/'

/** Ficha verificada si hay slug; si no, una busqueda restringida al sitio. */
export function musclewikiUrl(ex: LibraryExercise): string {
  const slug = ex.musclewiki.slug
  if (slug) return SITE + slug
  return 'https://www.google.com/search?q=' + encodeURIComponent(`site:musclewiki.com ${ex.name}`)
}

/** Texto del boton de enlace: video si hay ficha, busqueda si no. */
export function musclewikiLinkLabel(ex: LibraryExercise): string {
  return ex.musclewiki.slug ? 'Ver video en MuscleWiki' : 'Buscar en MuscleWiki'
}
