// Enlaces a MuscleWiki. Puro: sin React ni red.
import type { LibraryExercise } from '../types'

const SITE = 'https://musclewiki.com/es-es/exercise/'

/** Ficha verificada si hay slug; si no, una busqueda restringida al sitio. */
export function musclewikiUrl(ex: LibraryExercise): string {
  const slug = ex.musclewiki.slug
  if (slug) return SITE + slug
  return musclewikiSearchUrl(ex.name)
}

/** Busqueda restringida a musclewiki.com (no se descarga nada del sitio). */
export function musclewikiSearchUrl(query: string): string {
  return 'https://www.google.com/search?q=' + encodeURIComponent(`site:musclewiki.com ${query.trim()}`.trimEnd())
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i

/**
 * Lee un enlace de ficha (musclewiki.com/exercise/<slug>, con o sin locale,
 * query, hash o barra final) o un slug suelto. Otros hosts: null.
 * El nombre sale del slug: "machine-hack-squat" -> "Machine hack squat".
 */
export function parseMusclewikiLink(input: string): { slug: string; name: string } | null {
  const raw = input.trim()
  if (!raw) return null
  let slug: string | null = null
  if (SLUG_RE.test(raw)) {
    slug = raw
  } else {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
      const host = url.hostname.toLowerCase()
      if (host !== 'musclewiki.com' && host !== 'www.musclewiki.com') return null
      const parts = url.pathname.split('/').filter(Boolean)
      const i = parts.indexOf('exercise')
      if (i < 0 || i > 1 || !parts[i + 1]) return null
      slug = decodeURIComponent(parts[i + 1])
    } catch {
      return null
    }
  }
  if (!slug || !SLUG_RE.test(slug)) return null
  slug = slug.toLowerCase()
  const words = slug.split('-').join(' ')
  return { slug, name: words.charAt(0).toUpperCase() + words.slice(1) }
}

/** Texto del boton de enlace: video si hay ficha, busqueda si no. */
export function musclewikiLinkLabel(ex: LibraryExercise): string {
  return ex.musclewiki.slug ? 'Ver video en MuscleWiki' : 'Buscar en MuscleWiki'
}
