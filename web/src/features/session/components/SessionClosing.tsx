import type { StrengthSession } from '../../../lib/types'
import { todayISO } from '../../../lib/calc'
import { exerciseNameInRoutine, findRoutine, routineDisplayName } from '../../../lib/planQueries'
import { useStore } from '../../../lib/store'
import { restAllowance } from '../../habit/lib/week'
import { summarizeSession } from '../lib/summary'
import SessionSummary from './SessionSummary'

/** Container for the closing screen: reads the saved history and the plan
 *  from the store and hands the derived summary to SessionSummary. The streak
 *  uses the same context as Hoy (today's date and the plan's rest wildcards). */
export default function SessionClosing({ finished, onDone }: { finished: StrengthSession; onDone: () => void }) {
  const { sessions, plan, config } = useStore()
  const routine = findRoutine(plan, finished.routineId)
  const summary = summarizeSession(finished, sessions, { config, today: todayISO(), restAllowance: restAllowance(plan) })
  return (
    <SessionSummary
      routineName={routine ? routineDisplayName(routine.name) : ''}
      summary={summary}
      nameOf={id => exerciseNameInRoutine(plan, finished.routineId, id)}
      onDone={onDone}
    />
  )
}
