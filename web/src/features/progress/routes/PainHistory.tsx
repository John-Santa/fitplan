import { useStore } from '../../../lib/store'
import { fmtDate } from '../../../lib/calc'
import { exerciseNameInRoutine } from '../../../lib/planQueries'
import { painByExerciseWeek, painVerdict, isPainValue } from '../../../lib/pain'
import { Empty } from '../../../components/ui'

/** Recorded pain per exercise and week (read-only over saved sessions). */
export default function PainHistory({ onBack }: { onBack: () => void }) {
  const { sessions, plan } = useStore()
  const history = painByExerciseWeek(sessions)

  // The name is resolved in the routine of the latest session that recorded
  // pain for the exercise, so routine labels, archived routines and deleted
  // custom exercises fall back like the session detail does.
  const nameOf = (exerciseId: string): string => {
    const latest = sessions
      .filter(s => s.kind === 'strength' && s.pain && isPainValue(s.pain[exerciseId]))
      .sort((a, b) => b.startedAt - a.startedAt)[0]
    return latest && latest.kind === 'strength' ? exerciseNameInRoutine(plan, latest.routineId, exerciseId) : exerciseId
  }

  return (
    <>
      <button className="ghost" onClick={onBack}>← Volver</button>
      <h1>Registro de dolor</h1>
      {history.length === 0 ? (
        <Empty title="Sin dolor registrado">
          Todavía no registraste dolor. Aparece aquí cuando lo marques al terminar un ejercicio.
        </Empty>
      ) : (
        history.map(ex => (
          <div className="card" key={ex.exerciseId} style={{ marginTop: 12 }}>
            <div className="t1">{nameOf(ex.exerciseId)}</div>
            {ex.weeks.map(w => (
              <p key={w.monday} className="num" style={{ margin: 0 }}>
                {`Semana del ${fmtDate(w.monday)}: ${w.max}/10 · ${painVerdict(w.max).label}`}
              </p>
            ))}
          </div>
        ))
      )}
    </>
  )
}
