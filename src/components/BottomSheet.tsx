import { useEffect, useId, useRef, type ReactNode } from 'react'
import './sheet.css'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

interface BottomSheetProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Hoja inferior compartida: scrim, cierre con Escape o toque en el scrim,
 *  foco dentro de la hoja y devuelto al cerrar, y bloqueo del scroll de fondo. */
export default function BottomSheet({ title, onClose, children }: BottomSheetProps) {
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
    sheetRef.current?.focus()

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
      previous?.focus()
    }
  }, [])

  return (
    <div className="sheet-root">
      <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={sheetRef}>
        <header className="sheet-head">
          <h2 id={titleId} className="sheet-title">{title}</h2>
          <button type="button" className="sheet-close" aria-label="Cerrar" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
