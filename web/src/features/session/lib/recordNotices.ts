import { useEffect, useRef, useState } from 'react'
import type { Session, StrengthSession } from '../../../lib/types'
import { recordToast, recordsBroken } from '../../../lib/records'

/** What the session knows about each exercise on screen. */
export interface RecordSlot {
  exerciseId: string
  name: string
  /** Sets planned for the exercise today (plus any added in the session). */
  target: number
}

export interface RecordNotice {
  /** Stable per record and value, so each one is announced once. */
  key: string
  text: string
}

/** Records the live session beats that were not announced yet. A weight
 *  record is announced as soon as its set is done; a volume record waits for
 *  the exercise's last set, when its volume is final. */
export function recordNotices(
  session: StrengthSession,
  history: readonly Session[],
  slots: readonly RecordSlot[],
  announced: ReadonlySet<string>,
): RecordNotice[] {
  const out: RecordNotice[] = []
  for (const r of recordsBroken(session, history)) {
    const slot = slots.find(s => s.exerciseId === r.exerciseId)
    if (!slot) continue
    if (r.kind === 'volume') {
      const done = session.sets.filter(s => s.exerciseId === r.exerciseId && s.done).length
      if (done < slot.target) continue
    }
    const key = `${r.exerciseId}:${r.kind}:${r.value}`
    if (!announced.has(key)) out.push({ key, text: recordToast(r, slot.name) })
  }
  return out
}

/** The latest record notice for the session shell's toast, or null. Records
 *  already beaten when the screen mounts (a restored draft, an edited past
 *  session) are not announced again; a record undone later keeps its toast. */
export function useRecordNotice(
  session: StrengthSession,
  history: readonly Session[],
  slots: readonly RecordSlot[],
): { text: string; key: number } | null {
  const announced = useRef<Set<string> | null>(null)
  if (announced.current === null) {
    announced.current = new Set(recordNotices(session, history, slots, new Set()).map(n => n.key))
  }
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null)
  useEffect(() => {
    const seen = announced.current ?? new Set<string>()
    const fresh = recordNotices(session, history, slots, seen)
    if (fresh.length === 0) return
    for (const n of fresh) seen.add(n.key)
    setNotice({ text: fresh.map(n => n.text).join(' · '), key: Date.now() })
    // Only a change in the logged sets can break a record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sets])
  return notice
}
