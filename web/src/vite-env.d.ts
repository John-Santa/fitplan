/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clerk publishable key. Sin ella la app es 100% local (sin login). */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  /** URL base de la API de MagniFit, p. ej. https://api.magnifit.co */
  readonly VITE_API_URL?: string
}
