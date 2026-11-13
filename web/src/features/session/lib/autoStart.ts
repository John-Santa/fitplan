import { DISCIPLINES } from '../../../lib/disciplines'
import type { Session } from '../../../lib/types'

/** What Hoy asked the Train screen to open: a gym routine (optionally minimal
 *  or for a past date) or a swim ("Nadar" on Hoy under Natación). */
export interface AutoStartRequest {
  routineId?: string
  minimal?: boolean
  date?: string
  swim?: boolean
}

/** The session a start from Hoy opens, or null when nothing was asked. A swim
 *  is always for today, with the configured pool length, like the "Nadar"
 *  button on the Train screen. */
export function autoStartSession(req: AutoStartRequest, today: string, poolLengthM: number): Session | null {
  if (req.swim) return DISCIPLINES.swim.create(today, poolLengthM)
  if (!req.routineId) return null
  const created = DISCIPLINES.strength.create(req.date ?? today, req.routineId)
  return req.minimal ? { ...created, minimal: true } : created
}
