// Display data of each discipline (S2): the name the UI shows, the lowercase
// noun used inside sentences, and the SVG path of its icon (2 px stroke,
// 24x24 viewBox; the same paths Home.tsx draws). Reusable by any screen that
// has to name or draw a discipline.
import type { SessionKind } from '../lib/types'

export interface DisciplineMeta {
  /** Shown in the chip and the sheet: "Gimnasio", "Natación". */
  name: string
  /** Lowercase, for running text: "Tus sesiones de natación se conservan". */
  noun: string
  /** `d` attribute of the icon's path. */
  iconPath: string
}

export const DISCIPLINE_META: Record<SessionKind, DisciplineMeta> = {
  strength: {
    name: 'Gimnasio',
    noun: 'gimnasio',
    iconPath: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
  },
  swim: {
    name: 'Natación',
    noun: 'natación',
    iconPath: 'M2 17c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 12c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5',
  },
}

export const disciplineName = (kind: SessionKind): string => DISCIPLINE_META[kind].name

/** "Racha: 12 días", "Racha: 1 día". */
export const streakLabel = (days: number): string => `Racha: ${days} ${days === 1 ? 'día' : 'días'}`
