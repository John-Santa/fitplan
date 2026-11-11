// Iconos en linea (trazo de 2 px, puntas redondas), mismo estilo que la barra
// de pestanas. Siempre decorativos: el boton que los contiene lleva aria-label.
import type { ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>,
  swap: <><path d="M5 8h13l-3-3" /><path d="M19 16H6l3 3" /></>,
  back: <path d="m15 5-7 7 7 7" />,
  next: <path d="m9 5 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  book: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></>,
  shield: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />,
  steps: <><path d="M8 4c-1.7 0-3 1.8-3 4s1 3 2 3 2-1 2-3-.3-4-1-4Z" /><path d="M7 14h3v2a1.5 1.5 0 0 1-3 0v-2Z" /><path d="M16 8c-1.7 0-3 1.8-3 4s1 3 2 3 2-1 2-3-.3-4-1-4Z" /><path d="M15 18h3v1a1.5 1.5 0 0 1-3 0v-1Z" /></>,
  swim: <><path d="M3 17c1.5 0 1.5 1.5 3 1.5S7.5 17 9 17s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5S19.5 17 21 17" /><path d="M3 12.5c1.5 0 1.5 1.5 3 1.5s1.5-1.5 3-1.5 1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5" /><circle cx="15" cy="6" r="1.5" /><path d="m9 10 3-3 3 2" /></>,
  check: <path d="m5 12 5 5 9-10" />,
}

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}
