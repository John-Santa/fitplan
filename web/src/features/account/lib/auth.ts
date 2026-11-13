// Login opcional. Este módulo NO importa Clerk: lo usan los componentes y
// api.ts sin arrastrar el SDK cuando no hay clave configurada. El puente real
// con Clerk vive en ../components/clerkAuth.tsx y solo se carga (import dinámico) si
// `authEnabled` es verdadero.
import { createContext, useContext } from 'react'

export const authEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)

export type AuthUser = { name: string | null; email: string | null }

export type AuthState = {
  /** Hay clave de Clerk configurada. */
  enabled: boolean
  /** Clerk terminó de cargar (false mientras carga o si no hay red). */
  isLoaded: boolean
  isSignedIn: boolean
  /** Id de usuario de Clerk (el mismo `sub` que usa la API); null sin sesión. */
  userId: string | null
  user: AuthUser | null
  /** Lanza si Clerk no puede dar token (p. ej. sin conexión). */
  getToken: () => Promise<string | null>
}

export const DISABLED_AUTH: AuthState = {
  enabled: false,
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  user: null,
  getToken: async () => null,
}

export const AuthContext = createContext<AuthState>(DISABLED_AUTH)

export const useAuthState = () => useContext(AuthContext)

// Registro a nivel de módulo para código fuera de React (api.ts, sync). El
// puente de Clerk lo fija al montarse.
type TokenGetter = () => Promise<string | null>
let tokenGetter: TokenGetter | null = null

export function setTokenGetter(fn: TokenGetter | null): void {
  tokenGetter = fn
}

export async function getAuthToken(): Promise<string | null> {
  return tokenGetter ? tokenGetter() : null
}

// Cierre de sesión para código fuera del árbol de Clerk (zona de peligro):
// el puente lo fija al montarse. Sin Clerk no hace nada.
type SignOut = () => Promise<void>
let signOutHandler: SignOut | null = null

export function setSignOutHandler(fn: SignOut | null): void {
  signOutHandler = fn
}

export async function signOutOfAuth(): Promise<void> {
  if (signOutHandler) await signOutHandler()
}
