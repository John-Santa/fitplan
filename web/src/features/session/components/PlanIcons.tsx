// Iconos en linea (trazo, igual que los de la barra de pestañas). Decorativos:
// el texto del boton o del veredicto siempre dice lo mismo.
import type { PainLevel } from '../../../lib/pain'

const base = { viewBox: '0 0 24 24', 'aria-hidden': true, className: 'ses-icon' } as const

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
  <svg {...base} className={open ? 'ses-icon ses-chevron open' : 'ses-icon ses-chevron'}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

export const CheckCircle = () => (
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

export const CloseIcon = () => (
  <svg {...base}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
)

export const MinusIcon = () => (
  <svg {...base}>
    <line x1="6" y1="12" x2="18" y2="12" />
  </svg>
)

export const PlusIcon = () => (
  <svg {...base}>
    <line x1="6" y1="12" x2="18" y2="12" />
    <line x1="12" y1="6" x2="12" y2="18" />
  </svg>
)

export const ArrowRightIcon = () => (
  <svg {...base}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  </svg>
)

export const TimerIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="13" r="8" />
    <polyline points="12 9 12 13 15 15" />
    <line x1="9.5" y1="2.8" x2="14.5" y2="2.8" />
  </svg>
)

export const TrendIcon = () => (
  <svg {...base}>
    <polyline points="3 17 9 11 13 15 21 7" />
    <polyline points="15 7 21 7 21 13" />
  </svg>
)

export const TipIcon = () => (
  <svg {...base}>
    <path d="M9 18h6" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
  </svg>
)

export const ClockIcon = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <polyline points="12 7.5 12 12 15 13.5" />
  </svg>
)
