// The user's disciplines and the selected one (S1, D2-A, D3-A, D7-A).
//
// - The list ("Tus disciplinas") is Config.disciplines: synced, and filled by
//   mergeConfig with DEFAULT_DISCIPLINES whenever a stored body lacks it.
// - D2-A adds Natación for a user who already swam. It needs the sessions,
//   which mergeConfig does not have, so it is applied once, as a local
//   migration, wherever a raw config body without a list is still visible
//   (withDisciplines: boot, backup import, pull). From then on the list is
//   stored and read as is, so hiding a discipline persists.
// - The selected discipline is per device, in localStorage, behind try/catch;
//   a missing, invalid or unreadable value resolves to the first of the list.
//
// Every screen reads both through useDiscipline (lib/useDiscipline.ts); this
// module holds its pure rules so they can be tested without a DOM.
import { DISCIPLINES } from './disciplines'
import { DEFAULT_DISCIPLINES } from './plan'
import type { Config, Session, SessionKind } from './types'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Every discipline this build knows, in catalog order. */
export const DISCIPLINE_CATALOG = Object.keys(DISCIPLINES) as SessionKind[]

/** localStorage key of the discipline selected on this device. Both erase
 *  paths remove it (features/sync/lib/erase.ts). */
export const DISCIPLINE_STORAGE_KEY = 'fitplan:discipline'

const isKind = (v: unknown): v is SessionKind => typeof v === 'string' && (DISCIPLINE_CATALOG as string[]).includes(v)

/** D2-A: Gimnasio, plus every other discipline the user already has a
 *  session of (today only Natación), in catalog order. */
export function defaultDisciplines(sessions: readonly Session[]): SessionKind[] {
  const kinds = new Set(sessions.map(s => s.kind))
  return DISCIPLINE_CATALOG.filter(k => DEFAULT_DISCIPLINES.includes(k) || kinds.has(k))
}

/** The user's list, exactly as stored. D2-A is not applied here: it was
 *  applied once when the list was first stored (withDisciplines), and
 *  applying it on every read would bring back a hidden Natación. */
export function disciplineList(config: Pick<Config, 'disciplines'>): SessionKind[] {
  return config.disciplines
}

/** True when a raw stored or synced config body carries a discipline list
 *  (any array: mergeConfig validates it). Bodies written before the field,
 *  or by an older client, do not. */
export function hasDisciplines(body: unknown): boolean {
  return isObject(body) && Array.isArray(body.disciplines)
}

/** The one-time D2-A migration. `config` is `body` already read through
 *  mergeConfig; when `body` carries no list, `config` gets `fallback()`
 *  instead of the plain default (callers pass defaultDisciplines of the
 *  sessions that will be stored, or the local list a pulled body must not
 *  undo). A body that carries a list is returned untouched, so the
 *  migration never runs twice and a hidden discipline stays hidden. */
export async function withDisciplines(
  body: unknown,
  config: Config,
  fallback: () => readonly SessionKind[] | Promise<readonly SessionKind[]>,
): Promise<Config> {
  if (hasDisciplines(body)) return config
  const list = [...new Set((await fallback()).filter(isKind))]
  return list.length ? { ...config, disciplines: list } : config
}

/** The selected discipline: `stored` when it is in the list, else the first
 *  of the list (hidden on another device, invalid, or never chosen). */
export function resolveActive(stored: unknown, list: readonly SessionKind[]): SessionKind {
  if (isKind(stored) && list.includes(stored)) return stored
  return list[0] ?? DEFAULT_DISCIPLINES[0]
}

/** `list` with `kind` appended; the same list when it is already there. */
export function addDiscipline(list: SessionKind[], kind: SessionKind): SessionKind[] {
  return list.includes(kind) || !isKind(kind) ? list : [...list, kind]
}

/** `list` without `kind`. The last discipline cannot be hidden, and hiding
 *  one that is not listed changes nothing: both return the same list. Hiding
 *  only edits the list; no session, measurement or plan is deleted. */
export function hideDiscipline(list: SessionKind[], kind: SessionKind): SessionKind[] {
  return list.includes(kind) && list.length > 1 ? list.filter(k => k !== kind) : list
}

/** The raw value stored on this device, or null when there is none or
 *  localStorage is unavailable. resolveActive validates it. */
export function readStoredDiscipline(): string | null {
  try {
    return localStorage.getItem(DISCIPLINE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeStoredDiscipline(kind: SessionKind): void {
  try {
    localStorage.setItem(DISCIPLINE_STORAGE_KEY, kind)
  } catch {
    // Storage blocked: the choice lasts until the next reload.
  }
}

export function removeStoredDiscipline(): void {
  try {
    localStorage.removeItem(DISCIPLINE_STORAGE_KEY)
  } catch {
    // Storage blocked: nothing was saved there either.
  }
}

export interface DisciplineApi {
  /** The selected discipline, always a member of `list`. */
  active: SessionKind
  /** The user's disciplines, ordered, unique and non-empty. */
  list: SessionKind[]
  /** Selects a listed discipline on this device. Never saves Config (D3-A). */
  select: (kind: SessionKind) => void
  /** Appends a discipline to the synced list and selects it. */
  add: (kind: SessionKind) => Promise<void>
  /** Removes a discipline from the synced list (never the last one); hiding
   *  the selected one selects the first remaining. */
  hide: (kind: SessionKind) => Promise<void>
}

export interface DisciplineDeps {
  config: Config
  /** The raw stored selection (readStoredDiscipline), held as shared state. */
  stored: unknown
  /** Updates that shared state, so every consumer re-renders. */
  setStored: (kind: SessionKind) => void
  /** The store's saveConfig: the one config write path (outbox included). */
  saveConfig: (c: Config) => Promise<void>
}

/** The hook's behavior without React: useDiscipline wraps this. */
export function disciplineActions({ config, stored, setStored, saveConfig }: DisciplineDeps): DisciplineApi {
  const list = disciplineList(config)
  const active = resolveActive(stored, list)
  const choose = (kind: SessionKind) => {
    writeStoredDiscipline(kind)
    setStored(kind)
  }
  return {
    active,
    list,
    select: kind => {
      if (list.includes(kind)) choose(kind)
    },
    add: async kind => {
      if (!isKind(kind)) return
      const next = addDiscipline(list, kind)
      if (next !== list) await saveConfig({ ...config, disciplines: next })
      choose(kind)
    },
    hide: async kind => {
      const next = hideDiscipline(list, kind)
      if (next === list) return
      await saveConfig({ ...config, disciplines: next })
      if (active === kind) choose(next[0])
    },
  }
}
