// Puente con Clerk. Solo se importa dinámicamente cuando hay clave (ver
// main.tsx y Settings.tsx), así el build sin clave no ejecuta nada de Clerk.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ClerkProvider, SignInButton, UserButton, useAuth, useClerk, useUser } from '@clerk/react'
import { AuthContext, setSignOutHandler, setTokenGetter, type AuthState } from '../lib/auth'
import SignOutDialog from './SignOutDialog'

function Bridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth()
  const { user } = useUser()

  useEffect(() => {
    setTokenGetter(() => getToken())
    return () => setTokenGetter(null)
  }, [getToken])

  useEffect(() => {
    setSignOutHandler(() => signOut())
    return () => setSignOutHandler(null)
  }, [signOut])

  const value = useMemo<AuthState>(
    () => ({
      enabled: true,
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      userId: isSignedIn ? (userId ?? null) : null,
      user: user
        ? { name: user.fullName ?? user.username ?? null, email: user.primaryEmailAddress?.emailAddress ?? null }
        : null,
      getToken: () => getToken(),
    }),
    [isLoaded, isSignedIn, userId, user, getToken],
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

/** "Cerrar sesión": opens the dialog that syncs, warns and asks what to do
 *  with the data on the device. Needs the Clerk provider (useClerk). */
export function SignOutControl() {
  const clerk = useClerk()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Cerrar sesión</button>
      {open && <SignOutDialog signOut={() => clerk.signOut()} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Botón de entrar / avatar de la cuenta. Va dentro del ClerkAuthProvider. */
export function AccountControls({ isSignedIn }: { isSignedIn: boolean }) {
  return isSignedIn ? (
    // Only "Manage account": signing out goes through SignOutControl so the
    // person always chooses between keeping and erasing the device's data.
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action label="manageAccount" />
      </UserButton.MenuItems>
    </UserButton>
  ) : (
    <SignInButton mode="modal">
      <button className="primary">Iniciar sesión</button>
    </SignInButton>
  )
}
