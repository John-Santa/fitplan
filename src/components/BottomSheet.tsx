import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './sheet.css'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

interface BottomSheetProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Clase extra para estilos propios de una vista (p. ej. `pe-scope` del editor). */
  className?: string
  /** Oculta el titular visible de la cabecera (sigue siendo el nombre accesible).
   *  Para hojas que pintan su propio titular dentro del contenido. */
  titleHidden?: boolean
}

/** Hoja inferior compartida: scrim, cierre con Escape o toque en el scrim,
 *  foco dentro de la hoja y devuelto al cerrar, y bloqueo del scroll de fondo. */
/** Unica hoja modal de la app (ficha, señales de alarma, editor del plan).
 *  Se monta en un portal sobre el body para quedar por encima del toast y de
 *  la barra de pestañas sin depender del contexto de apilamiento de la vista. */
export default function BottomSheet({ title, onClose, children, className, titleHidden = false }: BottomSheetProps) {
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // El foco va al panel, no a un campo: no abre el teclado del telefono ni desplaza la vista.
    sheetRef.current?.focus({ preventScroll: true })

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !sheetRef.current) return
      const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === sheetRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previous?.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className="sheet-root">
      <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div className={className ? `sheet ${className}` : 'sheet'} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={sheetRef}>
        <header className="sheet-head">
          <span className="sheet-spacer" aria-hidden="true" />
          <div className="sheet-grab" aria-hidden="true" />
          <button type="button" className="sheet-close" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <h2 id={titleId} className={titleHidden ? 'sheet-sr' : 'sheet-title'}>{title}</h2>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
