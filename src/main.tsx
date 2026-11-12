import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { authEnabled } from './lib/auth'
import './styles.css'

// Sin VITE_CLERK_PUBLISHABLE_KEY la app es local-first pura: Clerk ni se
// descarga. Con clave, se envuelve en ClerkProvider; si el chunk no carga
// (sin red en el primer arranque), la app sigue funcionando sin cuenta.
async function loadProvider(): Promise<(props: { children: ReactNode }) => ReactNode> {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  if (authEnabled && key) {
    try {
      const { ClerkAuthProvider } = await import('./lib/clerkAuth.tsx')
      return ({ children }) => <ClerkAuthProvider publishableKey={key}>{children}</ClerkAuthProvider>
    } catch (e) {
      console.warn('No se pudo cargar el login', e)
    }
  }
  return ({ children }) => children
}

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
