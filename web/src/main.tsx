import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { loadProvider } from './app/providers'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/styles.css'

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
