import { useState, type ReactNode } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { ErrorScreen } from './components/ErrorScreen'
import Home from './views/Home'
import Train from './views/Train'
import Measure from './views/Measure'
import Habit from './views/Habit'
import Settings from './views/Settings'
import PlanEditor from './views/PlanEditor'
import { loadActiveDraft } from './lib/activeSession'
import Guide from './views/Guide'

type Tab = 'home' | 'plan' | 'progreso' | 'perfil'
type ProgressView = 'habit' | 'train' | 'measure'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Hoy', icon: <><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></> },
  { id: 'plan', label: 'Plan', icon: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></> },
  { id: 'progreso', label: 'Progreso', icon: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></> },
  { id: 'perfil', label: 'Perfil', icon: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5" /></> },
]

function Shell() {
  const { ready, dbError } = useStore()
  // A workout in progress survives a reload: reopen it where it was.
  const [tab, setTab] = useState<Tab>(() => (loadActiveDraft() ? 'progreso' : 'home'))
  const [progressView, setProgressView] = useState<ProgressView>(() => (loadActiveDraft() ? 'train' : 'habit'))
  const [auto, setAuto] = useState<{ id: string; minimal: boolean } | undefined>(undefined)
  // La Guia es una pantalla secundaria: se abre desde Plan y no tiene pestaña propia.
  const [guideOpen, setGuideOpen] = useState(false)
  // Tapping Progreso always lands on Hábito, the default segment.
  const selectTab = (t: Tab) => {
    setGuideOpen(false)
    if (t === 'progreso') setProgressView('habit')
    setTab(t)
  }
  const startRoutine = (routineId: string, opts?: { minimal?: boolean }) => {
    setGuideOpen(false)
    setProgressView('train')
    setAuto({ id: routineId, minimal: opts?.minimal === true })
    setTab('progreso')
  }

  if (dbError) {
    return <ErrorScreen title="No se pudo abrir la base de datos" message={dbError} />
  }

  if (!ready) {
    return (
      <div className="app">
        <div className="main">
          <p className="muted" style={{ textAlign: 'center', marginTop: 60 }}>Cargando…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <main className="main">
        {guideOpen ? (
          <Guide onBack={() => setGuideOpen(false)} />
        ) : (
          <>
            {tab === 'home' && <Home go={t => selectTab(t)} startRoutine={startRoutine} />}
            {tab === 'plan' && <PlanEditor onOpenGuide={() => setGuideOpen(true)} />}
            {tab === 'progreso' && (
              <>
                <div className="seg" role="tablist" aria-label="Progreso">
                  <button
                    role="tab"
                    aria-selected={progressView === 'habit'}
                    className={progressView === 'habit' ? 'active' : ''}
                    onClick={() => setProgressView('habit')}
                  >
                    Hábito
                  </button>
                  <button
                    role="tab"
                    aria-selected={progressView === 'train'}
                    className={progressView === 'train' ? 'active' : ''}
                    onClick={() => setProgressView('train')}
                  >
                    Entrenamientos
                  </button>
                  <button
                    role="tab"
                    aria-selected={progressView === 'measure'}
                    className={progressView === 'measure' ? 'active' : ''}
                    onClick={() => setProgressView('measure')}
                  >
                    Medidas
                  </button>
                </div>
                {progressView === 'habit' && <Habit />}
                {progressView === 'train' && (
                  <Train autoStart={auto?.id} autoStartMinimal={auto?.minimal} onAutoStarted={() => setAuto(undefined)} />
                )}
                {progressView === 'measure' && <Measure />}
              </>
            )}
            {tab === 'perfil' && <Settings />}
          </>
        )}
      </main>
      <nav className="tabbar" aria-label="Secciones">
        {TABS.map(t => (
          <button
            key={t.id}
            className={tab === t.id && !guideOpen ? 'active' : ''}
            onClick={() => selectTab(t.id)}
            aria-current={tab === t.id && !guideOpen ? 'page' : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">{t.icon}</svg>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
