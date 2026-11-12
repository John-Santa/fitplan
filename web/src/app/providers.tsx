import type { ReactNode } from 'react'
import { authEnabled } from '../features/account/lib/auth'

export type RootProvider = (props: { children: ReactNode }) => ReactNode

// Sin VITE_CLERK_PUBLISHABLE_KEY la app es local-first pura: Clerk ni se
// descarga. Con clave, se envuelve en ClerkProvider; si el chunk no carga
// (sin red en el primer arranque), la app sigue funcionando sin cuenta.
export async function loadProvider(): Promise<RootProvider> {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  if (authEnabled && key) {
    try {
      const { ClerkAuthProvider } = await import('../features/account/components/clerkAuth.tsx')
      return ({ children }) => <ClerkAuthProvider publishableKey={key}>{children}</ClerkAuthProvider>
    } catch (e) {
      console.warn('No se pudo cargar el login', e)
    }
  }
  return ({ children }) => children
}
