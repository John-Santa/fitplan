// Discipline switcher (S2, S3): a chip showing the selected discipline and a
// bottom sheet "Tus disciplinas" to switch, add or hide one. Everything comes
// from useDiscipline; the parent only mounts <DisciplineSwitcher /> above a tab.
//
// Layers: DisciplineChip and DisciplineSheetBody are presentational (props
// only, tested without a DOM); selectFromSheet / addFromSheet / hideFromSheet
// are the handlers, pure over the hook's API; DisciplineSwitcher wires them.
import { useState } from 'react'
import BottomSheet from './BottomSheet'
import { useToast } from './ui'
import { DISCIPLINE_CATALOG } from '../lib/disciplineSelection'
import { todayISO } from '../lib/calc'
import { useStore } from '../lib/store'
import { useDiscipline } from '../lib/useDiscipline'
import type { DisciplineApi } from '../lib/disciplineSelection'
import type { SessionKind } from '../lib/types'
import { habitContextFor } from '../features/habit/lib/disciplineHabit'
import { streak } from '../features/habit/lib/habit'
import { DISCIPLINE_META, disciplineName, streakLabel } from './disciplineMeta'
import './DisciplineSwitcher.css'

type Actions = Pick<DisciplineApi, 'select' | 'add' | 'hide'>

/** Selecting one: per device, closes the sheet, never saves Config (D3-A). */
export function selectFromSheet(api: Pick<Actions, 'select'>, kind: SessionKind, close: () => void): void {
  api.select(kind)
  close()
}

/** Appends and selects through the hook, then toasts "Natación agregada". A
 *  failed save shows no toast and leaves the sheet open. */
export async function addFromSheet(
  api: Pick<Actions, 'add'>,
  kind: SessionKind,
  show: (msg: string) => void,
  close: () => void,
): Promise<void> {
  try {
    await api.add(kind)
  } catch {
    show('No se pudo agregar la disciplina')
    return
  }
  show(`${disciplineName(kind)} agregada`)
  close()
}

/** Hides through the hook, then returns to the list. Sessions are untouched. */
export async function hideFromSheet(api: Pick<Actions, 'hide'>, kind: SessionKind, back: () => void): Promise<void> {
  try {
    await api.hide(kind)
  } finally {
    back()
  }
}

function DisciplineIcon({ kind, size = 20 }: { kind: SessionKind; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={DISCIPLINE_META[kind].iconPath} />
    </svg>
  )
}

export function DisciplineChip({ active, onOpen }: { active: SessionKind; onOpen: () => void }) {
  return (
    <button type="button" className="dsw-chip" data-kind={active} aria-label={`Disciplina: ${disciplineName(active)}. Cambiar`} onClick={onOpen}>
      <DisciplineIcon kind={active} />
      <span>{disciplineName(active)}</span>
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  )
}

export type SheetView = { kind: 'list' } | { kind: 'adding' } | { kind: 'confirmHide'; target: SessionKind }

export function DisciplineSheetBody({ list, active, streaks, onSelect, onAdd, onHide, initialView = { kind: 'list' } }: {
  list: SessionKind[]
  active: SessionKind
  /** Current streak in days per discipline. */
  streaks: Partial<Record<SessionKind, number>>
  onSelect: (kind: SessionKind) => void
  onAdd: (kind: SessionKind) => void
  onHide: (kind: SessionKind) => void
  /** Starts the body in another view (tests; the sheet always opens on the list). */
  initialView?: SheetView
}) {
  const [view, setView] = useState<SheetView>(initialView)
  const missing = DISCIPLINE_CATALOG.filter(k => !list.includes(k))
  const back = () => setView({ kind: 'list' })

  if (view.kind === 'adding') {
    return (
      <div className="dsw-body">
        <p className="hint">¿Qué disciplina quieres agregar?</p>
        <ul className="dsw-list">
          {missing.map(k => (
            <li key={k}>
              <button type="button" className="dsw-row" onClick={() => onAdd(k)}>
                <DisciplineIcon kind={k} size={22} />
                <span className="dsw-name">{disciplineName(k)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="btnrow"><button type="button" onClick={back}>Cancelar</button></div>
      </div>
    )
  }

  if (view.kind === 'confirmHide') {
    const noun = DISCIPLINE_META[view.target].noun
    return (
      <div className="dsw-body">
        <p>¿Quitar {disciplineName(view.target)} de tu lista?</p>
        <p className="hint">Tus sesiones de {noun} se conservan. Puedes volver a agregarla.</p>
        <div className="btnrow">
          <button type="button" className="danger" onClick={() => onHide(view.target)}>Quitar</button>
          <button type="button" onClick={back}>Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dsw-body">
      <ul className="dsw-list">
        {list.map(k => (
          <li key={k} className="dsw-item">
            <button type="button" className="dsw-row" data-kind={k} aria-current={k === active ? 'true' : undefined} onClick={() => onSelect(k)}>
              <DisciplineIcon kind={k} size={22} />
              <span className="dsw-text">
                <span className="dsw-name">
                  {disciplineName(k)}
                  {k === active && <span className="sheet-sr"> (seleccionada)</span>}
                </span>
                <span className="dsw-streak">{streakLabel(streaks[k] ?? 0)}</span>
              </span>
              {k === active && (
                <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.5}
                  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="dsw-check">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              )}
            </button>
            {list.length > 1 && (
              <button type="button" className="dsw-hide" onClick={() => setView({ kind: 'confirmHide', target: k })}>
                Quitar de mi lista
                <span className="sheet-sr">: {disciplineName(k)}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <button type="button" className="dsw-add" onClick={() => setView({ kind: 'adding' })}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
          Agregar disciplina
        </button>
      )}
    </div>
  )
}

/** Chip + sheet, wired to the store and the discipline hook. No props are
 *  required; `defaultOpen` only starts it with the sheet open. */
export default function DisciplineSwitcher({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { active, list, select, add, hide } = useDiscipline()
  const { sessions, config, plan } = useStore()
  const [open, setOpen] = useState(defaultOpen)
  const toast = useToast()
  const close = () => setOpen(false)

  const today = todayISO()
  const streaks: Partial<Record<SessionKind, number>> = {}
  for (const k of list) {
    streaks[k] = streak(habitContextFor(k, sessions, config, plan, today, config.swimWeeklyTarget)).days
  }

  return (
    <>
      <DisciplineChip active={active} onOpen={() => setOpen(true)} />
      {open && (
        <BottomSheet title="Tus disciplinas" onClose={close} className="dsw-sheet">
          <DisciplineSheetBody
            list={list}
            active={active}
            streaks={streaks}
            onSelect={k => selectFromSheet({ select }, k, close)}
            onAdd={k => void addFromSheet({ add }, k, toast.show, close)}
            onHide={k => void hideFromSheet({ hide }, k, () => {})}
          />
        </BottomSheet>
      )}
      {toast.node}
    </>
  )
}
