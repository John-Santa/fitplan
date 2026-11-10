// Iconos en linea (trazo, igual que los de la barra de pestañas). Decorativos:
// el texto del boton o del veredicto siempre dice lo mismo.
import type { PainLevel } from '../../lib/pain'

const base = { viewBox: '0 0 24 24', 'aria-hidden': true, className: 'sp-icon' } as const

export const InfoIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16.5" />
    <circle cx="12" cy="7.8" r="0.6" />
  </svg>
)

export const AlertIcon = () => (
  <svg {...base}>
    <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
    <line x1="12" y1="10" x2="12" y2="14.2" />
    <circle cx="12" cy="17" r="0.6" />
  </svg>
)

export const PlayIcon = () => (
  <svg {...base}>
    <polygon points="8 5.5 18.5 12 8 18.5 8 5.5" />
  </svg>
)

export const StopIcon = () => (
  <svg {...base}>
    <rect x="6.5" y="6.5" width="11" height="11" />
  </svg>
)

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg {...base} className={open ? 'sp-icon sp-chevron open' : 'sp-icon sp-chevron'}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const CheckCircle = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="8 12.5 11 15.5 16.5 9" />
  </svg>
)

const StopOctagon = () => (
  <svg {...base}>
    <polygon points="8.2 3.5 15.8 3.5 20.5 8.2 20.5 15.8 15.8 20.5 8.2 20.5 3.5 15.8 3.5 8.2" />
    <line x1="9" y1="9" x2="15" y2="15" />
    <line x1="15" y1="9" x2="9" y2="15" />
  </svg>
)

/** Un icono distinto por nivel: la forma, no solo el color, dice el veredicto. */
export function PainIcon({ level }: { level: PainLevel }) {
  if (level === 'ok') return <CheckCircle />
  if (level === 'adjust') return <AlertIcon />
  return <StopOctagon />
}
