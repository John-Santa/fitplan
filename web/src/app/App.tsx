import { lazy, Suspense, useState, type ReactNode } from 'react'
import { StoreProvider, useStore } from '../lib/store'
import { ErrorScreen } from '../components/ErrorScreen'
import Home from '../features/today/routes/Home'
import Habit from '../features/habit/routes/Habit'
import Settings from '../features/account/routes/Settings'
import { loadActiveDraft } from '../features/session/lib/activeSession'
import MovedNotice from './MovedNotice'
import { PwaPrompts } from '../features/pwa/components/PwaPrompts'
import { SyncIndicator } from '../features/sync/components/SyncIndicator'

const Train = lazy(() => import('../features/session/routes/Train'))
const Measure = lazy(() => import('../features/progress/routes/Measure'))
const PlanEditor = lazy(() => import('../features/plan/routes/PlanEditor'))
const Guide = lazy(() => import('../features/guide/routes/Guide'))

function ScreenFallback() {
  return <p className="muted" style={{ textAlign: 'center', marginTop: 60 }}>Cargando…</p>
}

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
  const [auto, setAuto] = useState<{ id: string; minimal: boolean; date?: string } | undefined>(undefined)
  // La Guia es una pantalla secundaria: se abre desde Plan y no tiene pestaña propia.
  const [guideOpen, setGuideOpen] = useState(false)
  // Tapping Progreso always lands on Hábito, the default segment.
  const selectTab = (t: Tab) => {
    setGuideOpen(false)
    if (t === 'progreso') setProgressView('habit')
    setTab(t)
  }
  const startRoutine = (routineId: string, opts?: { minimal?: boolean; date?: string }) => {
    setGuideOpen(false)
    setProgressView('train')
    setAuto({ id: routineId, minimal: opts?.minimal === true, date: opts?.date })
    setTab('progreso')
  }

  if (dbError) {
    return <ErrorScreen title="No se pudo abrir la base de datos" message={dbError} />
  }

  if (!ready) {
    return (
      <div className="app">
        <MovedNotice />
        <div className="main">
          <p className="muted" style={{ textAlign: 'center', marginTop: 60 }}>Cargando…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <MovedNotice />
      <main className="main">
        <div className="app-notices">
          <SyncIndicator onOpenAccount={() => selectTab('perfil')} />
          <PwaPrompts />
        </div>
        <Suspense fallback={<ScreenFallback />}>
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
                  <Train autoStart={auto?.id} autoStartMinimal={auto?.minimal} autoStartDate={auto?.date} onAutoStarted={() => setAuto(undefined)} />
                )}
                {progressView === 'measure' && <Measure />}
              </>
            )}
            {tab === 'perfil' && <Settings />}
          </>
        )}
        </Suspense>
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
