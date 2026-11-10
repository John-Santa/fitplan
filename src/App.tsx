import { useState, type ReactNode } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { ErrorScreen } from './components/ErrorScreen'
import Home from './views/Home'
import Train from './views/Train'
import Measure from './views/Measure'
import Settings from './views/Settings'
import PlanEditor from './views/PlanEditor'
import Guide from './views/Guide'

type Tab = 'home' | 'train' | 'plan' | 'measure' | 'settings'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Inicio', icon: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></> },
  { id: 'train', label: 'Entrenar', icon: <><path d="M4 9v6M20 9v6M7 6v12M17 6v12M7 12h10" /></> },
  { id: 'plan', label: 'Plan', icon: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></> },
  { id: 'measure', label: 'Medidas', icon: <><path d="M3 17 9 11l4 4 8-8" /><path d="M14 7h7v7" /></> },
  { id: 'settings', label: 'Ajustes', icon: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></> },
]

function Shell() {
  const { ready, dbError } = useStore()
  const [tab, setTab] = useState<Tab>('home')
  // La Guia es una pantalla secundaria: se abre desde Plan y no tiene pestaña propia.
  const [guideOpen, setGuideOpen] = useState(false)
  const selectTab = (t: Tab) => { setGuideOpen(false); setTab(t) }

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
            {tab === 'home' && <Home go={selectTab} />}
            {tab === 'train' && <Train />}
            {tab === 'plan' && <PlanEditor onOpenGuide={() => setGuideOpen(true)} />}
            {tab === 'measure' && <Measure />}
            {tab === 'settings' && <Settings />}
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
