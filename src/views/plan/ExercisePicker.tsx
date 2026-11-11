// Selector de ejercicios: biblioteca + ejercicios propios del plan, con
// busqueda y filtro por categoria. Sirve para agregar y para cambiar; tambien
// aloja el formulario "Crear ejercicio propio".
import { useMemo, useState } from 'react'
import type { ExerciseCategory, LibraryExercise, TrainingPlan } from '../../types'
import { EXERCISE_LIBRARY } from '../../lib/library'
import { Icon } from './icons'
import Sheet from '../../components/BottomSheet'

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  strength: 'Fuerza', core: 'Core', mobility: 'Movilidad', cardio: 'Cardio',
}
const CATEGORIES = Object.keys(CATEGORY_LABEL) as ExerciseCategory[]

export interface NewExerciseInput {
  name: string
  category: ExerciseCategory
  primaryMuscles: string[]
  musclewikiSlug?: string
}

/** Minusculas sin tildes, para que "dorsal" encuentre "Dorsal ancho". */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function ExercisePicker({ plan, mode, currentExerciseId, taken, onPick, onCreate, onClose }: {
  plan: TrainingPlan
  mode: 'add' | 'swap' | 'browse'
  currentExerciseId?: string
  /** Ejercicios que ya estan en la rutina: no se pueden elegir de nuevo (routineExerciseIds). */
  taken: ReadonlySet<string>
  onPick: (exerciseId: string) => void
  onCreate: (input: NewExerciseInput) => void
  onClose: () => void
}) {
  const [view, setView] = useState<'list' | 'create'>('list')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all')

  const all = useMemo<LibraryExercise[]>(() => [...plan.customExercises, ...EXERCISE_LIBRARY], [plan.customExercises])
  const results = useMemo(() => {
    const q = norm(query.trim())
    return all.filter(e => {
      if (category !== 'all' && e.category !== category) return false
      if (!q) return true
      return norm([e.name, e.equipment, ...e.primaryMuscles, ...e.secondaryMuscles].join(' ')).includes(q)
    })
  }, [all, query, category])

  const title = mode === 'swap' ? 'Cambiar ejercicio' : mode === 'browse' ? 'Biblioteca de ejercicios' : 'Agregar ejercicio'

  if (view === 'create') {
    return (
      <Sheet className="pe-scope" title="Ejercicio propio" onClose={onClose}>
        <CreateForm
          submitLabel={mode === 'swap' ? 'Crear y usar' : mode === 'browse' ? 'Crear ejercicio' : 'Crear y agregar'}
          onBack={() => setView('list')}
          onSubmit={onCreate}
        />
      </Sheet>
    )
  }

  return (
    <Sheet className="pe-scope" title={title} onClose={onClose}>
      <label htmlFor="pe-search">Buscar</label>
      <input
        id="pe-search"
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Nombre, músculo o equipo"
        autoComplete="off"
      />
      <div className="pe-chips" role="group" aria-label="Filtrar por categoría">
        <button type="button" className="pe-chip" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Todos</button>
        {CATEGORIES.map(c => (
          <button key={c} type="button" className="pe-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      <button type="button" className="pe-gap-md" onClick={() => setView('create')}>Crear ejercicio propio</button>

      <p className="muted pe-count" role="status">
        {results.length === 1 ? '1 ejercicio' : `${results.length} ejercicios`}
      </p>

      {results.length === 0 ? (
        <div className="pe-empty">
          <h3>Sin resultados</h3>
          <p className="muted">Prueba con otra palabra o crea el ejercicio tú mismo.</p>
        </div>
      ) : (
        <ul className="pe-list">
          {results.map(e => {
            const inRoutine = taken.has(e.id) && e.id !== currentExerciseId
            return (
            <li key={e.id}>
              <button type="button" className="pe-pick" onClick={() => onPick(e.id)} disabled={inRoutine} aria-current={e.id === currentExerciseId ? 'true' : undefined}>
                <span className="pe-pick-text">
                  <span className="pe-name">{e.name}</span>
                  <span className="pe-sub">
                    {CATEGORY_LABEL[e.category]}
                    {e.primaryMuscles.length > 0 && ` · ${e.primaryMuscles.join(', ')}`}
                  </span>
                </span>
                {e.custom && <span className="pill">Propio</span>}
                {e.id === currentExerciseId && <span className="pill good">Actual</span>}
                {inRoutine && <span className="pill">En la rutina</span>}
              </button>
            </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

function CreateForm({ submitLabel, onBack, onSubmit }: {
  submitLabel: string
  onBack: () => void
  onSubmit: (input: NewExerciseInput) => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<ExerciseCategory>('strength')
  const [muscles, setMuscles] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (name.trim() === '') {
      setError('Escribe un nombre para el ejercicio.')
      return
    }
    onSubmit({
      name,
      category,
      primaryMuscles: muscles.split(',').map(m => m.trim()).filter(Boolean),
      musclewikiSlug: slug.trim() || undefined,
    })
  }

  return (
    <form onSubmit={e => { e.preventDefault(); submit() }} noValidate>
      <button type="button" className="ghost pe-back" onClick={onBack}>
        <Icon name="back" /> Volver a la lista
      </button>

      <div className="pe-field">
        <label htmlFor="pe-new-name">Nombre</label>
        <input
          id="pe-new-name" value={name} onChange={e => { setName(e.target.value); setError(null) }}
          aria-invalid={error ? true : undefined} aria-describedby={error ? 'pe-new-name-err' : undefined}
          autoComplete="off"
        />
        {error && <p id="pe-new-name-err" className="pe-error" role="alert">{error}</p>}
      </div>
      <div className="pe-field">
        <label htmlFor="pe-new-cat">Categoría</label>
        <select id="pe-new-cat" value={category} onChange={e => setCategory(e.target.value as ExerciseCategory)}>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>
      <div className="pe-field">
        <label htmlFor="pe-new-muscles">Músculos principales</label>
        <input id="pe-new-muscles" value={muscles} onChange={e => setMuscles(e.target.value)} placeholder="Dorsal, Bíceps" autoComplete="off" />
        <p className="hint">Sepáralos con comas.</p>
      </div>
      <div className="pe-field">
        <label htmlFor="pe-new-slug">Enlace de MuscleWiki (opcional)</label>
        <input id="pe-new-slug" value={slug} onChange={e => setSlug(e.target.value)} placeholder="barbell-curl" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <p className="hint">Lo que va al final de musclewiki.com/es-es/exercise/… Sin él, el botón de video abre una búsqueda.</p>
      </div>

      <button type="submit" className="primary block pe-gap-lg">{submitLabel}</button>
    </form>
  )
}
