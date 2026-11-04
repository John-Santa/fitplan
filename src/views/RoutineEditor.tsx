import { useState } from 'react'
import type { Exercise, RoutineId } from '../types'
import { exerciseGuideUrl, moveItem, newExercise } from '../lib/plan'
import { useStore } from '../lib/store'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))

/** Editor de los ejercicios de cada rutina: agregar cualquier ejercicio por
 *  nombre (su guia se busca sola en MuscleWiki), quitar, reordenar y ajustar
 *  series, repeticiones y descanso. Los ids de ejercicio no cambian nunca, asi
 *  que el historial sobrevive a cualquier edicion. */
export default function RoutineEditor() {
  const { config, routines, saveConfig } = useStore()
  const [drafts, setDrafts] = useState<Partial<Record<RoutineId, string>>>({})

  const write = (routineId: RoutineId, exercises: Exercise[]) =>
    saveConfig({ ...config, routineExercises: { ...config.routineExercises, [routineId]: exercises } })

  const reset = (routineId: RoutineId) => {
    const { [routineId]: _drop, ...rest } = config.routineExercises
    return saveConfig({ ...config, routineExercises: rest })
  }

  return (
    <div className="card">
      {routines.map(r => {
        const edit = (id: string, patch: Partial<Exercise>) =>
          write(r.id, r.exercises.map(e => (e.id === id ? { ...e, ...patch } : e)))
        const draft = drafts[r.id] ?? ''
        const add = () => {
          if (draft.trim() === '') return
          setDrafts(d => ({ ...d, [r.id]: '' }))
          write(r.id, [...r.exercises, newExercise(draft)])
        }
        return (
          <details className="dayrow" key={r.id}>
            <summary className="list-item">
              <span className="grow">
                <span className="t1">{r.name}</span>
                <span className="t2">
                  {r.exercises.length} ejercicios{config.routineExercises[r.id] ? ' · personalizada' : ''}
                </span>
              </span>
              <span className="caret" aria-hidden="true">+</span>
            </summary>
            <div className="dayedit">
              {r.exercises.map((e, i) => (
                <div key={e.id} style={{ marginBottom: 16 }}>
                  <label htmlFor={`en-${e.id}`}>Ejercicio {i + 1}</label>
                  <input
                    id={`en-${e.id}`} type="text" defaultValue={e.name}
                    onBlur={ev => {
                      const name = ev.target.value.trim()
                      if (name === '') { ev.target.value = e.name; return }
                      // Un ejercicio personalizado sigue la busqueda por nombre;
                      // uno del catalogo conserva su slug de MuscleWiki.
                      if (name !== e.name) edit(e.id, { name })
                    }}
                  />
                  <div className="formgrid" style={{ marginTop: 8 }}>
                    <div>
                      <label htmlFor={`es-${e.id}`}>Series</label>
                      <input id={`es-${e.id}`} type="number" inputMode="numeric" defaultValue={e.sets}
                        onBlur={ev => { const v = Number(ev.target.value); if (!Number.isNaN(v)) edit(e.id, { sets: clamp(v, 1, 10) }) }} />
                    </div>
                    <div>
                      <label htmlFor={`el-${e.id}`}>Reps mín.</label>
                      <input id={`el-${e.id}`} type="number" inputMode="numeric" defaultValue={e.repsLow}
                        onBlur={ev => {
                          const v = Number(ev.target.value)
                          if (!Number.isNaN(v)) { const lo = clamp(v, 1, 100); edit(e.id, { repsLow: lo, repsHigh: Math.max(lo, e.repsHigh) }) }
                        }} />
                    </div>
                    <div>
                      <label htmlFor={`eh-${e.id}`}>Reps máx.</label>
                      <input id={`eh-${e.id}`} type="number" inputMode="numeric" defaultValue={e.repsHigh}
                        onBlur={ev => {
                          const v = Number(ev.target.value)
                          if (!Number.isNaN(v)) edit(e.id, { repsHigh: Math.max(e.repsLow, clamp(v, 1, 100)) })
                        }} />
                    </div>
                    <div>
                      <label htmlFor={`er-${e.id}`}>Descanso (s)</label>
                      <input id={`er-${e.id}`} type="number" inputMode="numeric" step="15" defaultValue={e.restSec}
                        onBlur={ev => { const v = Number(ev.target.value); if (!Number.isNaN(v)) edit(e.id, { restSec: clamp(v, 0, 600) }) }} />
                    </div>
                  </div>
                  <div className="btnrow" style={{ marginTop: 8 }}>
                    <button aria-label={`Subir ${e.name}`} disabled={i === 0}
                      onClick={() => write(r.id, moveItem(r.exercises, i, -1))}>↑</button>
                    <button aria-label={`Bajar ${e.name}`} disabled={i === r.exercises.length - 1}
                      onClick={() => write(r.id, moveItem(r.exercises, i, 1))}>↓</button>
                    <a className="btn" href={exerciseGuideUrl(e)} target="_blank" rel="noopener noreferrer">Ver guía</a>
                    <button className="danger" disabled={r.exercises.length === 1}
                      onClick={() => write(r.id, r.exercises.filter(x => x.id !== e.id))}>Quitar</button>
                  </div>
                </div>
              ))}

              <label htmlFor={`add-${r.id}`}>Agregar ejercicio</label>
              <input
                id={`add-${r.id}`} type="text" value={draft} placeholder="p. ej. Sentadilla búlgara"
                onChange={ev => setDrafts(d => ({ ...d, [r.id]: ev.target.value }))}
                onKeyDown={ev => { if (ev.key === 'Enter') add() }}
              />
              <div className="btnrow" style={{ marginTop: 8 }}>
                <button className="primary" onClick={add} disabled={draft.trim() === ''}>Agregar</button>
                {config.routineExercises[r.id] && (
                  <button onClick={() => { if (confirm('¿Volver a los ejercicios originales de esta rutina? El historial se conserva.')) reset(r.id) }}>
                    Restaurar originales
                  </button>
                )}
              </div>
              <p className="hint">
                La guía se busca sola en MuscleWiki con el nombre que escribas; los ejercicios originales enlazan directo.
              </p>
            </div>
          </details>
        )
      })}
    </div>
  )
}
