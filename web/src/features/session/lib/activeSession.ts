// The workout in progress lives only in memory until it is finished. This
// keeps a draft in localStorage so a reload, a crash or the OS killing the
// PWA does not lose the sets already logged.
import type { Session } from '../../../lib/types'
import { normalizeSession } from '../../../lib/plan'

const KEY = 'fitplan:active-session'

/** The unfinished session saved before the last reload, if any. */
export function loadActiveDraft(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = normalizeSession(JSON.parse(raw))
    return s && s.finishedAt == null ? s : null
  } catch {
    return null
  }
}

/** Saves the session in progress, or clears the draft with null. */
export function saveActiveDraft(s: Session | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage full or blocked: the session keeps working in memory.
  }
}
