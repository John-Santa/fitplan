// Puente con Clerk. Solo se importa dinámicamente cuando hay clave (ver
// main.tsx y Settings.tsx), así el build sin clave no ejecuta nada de Clerk.
import { useEffect, useMemo, type ReactNode } from 'react'
import { ClerkProvider, SignInButton, UserButton, useAuth, useUser } from '@clerk/react'
import { AuthContext, setTokenGetter, type AuthState } from './auth'

function Bridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user } = useUser()

  useEffect(() => {
    setTokenGetter(() => getToken())
    return () => setTokenGetter(null)
  }, [getToken])

  const value = useMemo<AuthState>(
    () => ({
      enabled: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      user: user
        ? { name: user.fullName ?? user.username ?? null, email: user.primaryEmailAddress?.emailAddress ?? null }
        : null,
      getToken: () => getToken(),
    }),
    [isLoaded, isSignedIn, user, getToken],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function ClerkAuthProvider({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <Bridge>{children}</Bridge>
    </ClerkProvider>
  )
}

/** Botón de entrar / avatar de la cuenta. Va dentro del ClerkAuthProvider. */
export function AccountControls({ isSignedIn }: { isSignedIn: boolean }) {
  return isSignedIn ? (
    <UserButton />
  ) : (
    <SignInButton mode="modal">
      <button className="primary">Iniciar sesión</button>
    </SignInButton>
  )
}
