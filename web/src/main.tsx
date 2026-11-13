import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { loadProvider } from './app/providers'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerServiceWorker } from './features/pwa/lib/useUpdatePrompt'
import './styles/styles.css'

// Before anything renders: the welcome screen of a new install must already
// work offline, and the update prompt picks the registration up later.
registerServiceWorker()

loadProvider().then(Provider => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <Provider>
          <App />
        </Provider>
      </ErrorBoundary>
    </StrictMode>,
  )
})
