import { getAuthToken } from '../account/lib/auth'
import type { ChangeSet, Me, PushChangeSet, PushResult } from './syncTypes'

export class ApiError extends Error {
  readonly status: number
  /** Espera pedida por el servidor (cabecera Retry-After), en ms. */
  readonly retryAfterMs?: number
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

/** Retry-After admite segundos enteros o una fecha HTTP; otro valor se ignora. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  const v = value?.trim()
  if (!v) return undefined
  if (/^\d+$/.test(v)) return Number(v) * 1000
  const at = Date.parse(v)
  return Number.isNaN(at) ? undefined : Math.max(0, at - now)
}

function baseUrl(): string {
  const base = import.meta.env.VITE_API_URL
  if (!base) throw new ApiError(0, 'VITE_API_URL no está configurada')
  return base.replace(/\/+$/, '')
}

async function errorMessage(res: Response): Promise<string> {
  const fallback = `Error ${res.status} del servidor`
  try {
    const data = await res.json()
    if (data && typeof data === 'object') {
      // The API answers RFC 7807 problem+json: the human message is `detail`.
      // `error`/`message` are kept as fallbacks for non-API proxies.
      const d = data as { detail?: unknown; error?: unknown; message?: unknown }
      const msg = d.detail ?? d.error ?? d.message
      if (typeof msg === 'string' && msg) return msg
    }
  } catch {
    // cuerpo no JSON
  }
  return fallback
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = baseUrl() + (path.startsWith('/') ? path : `/${path}`)
  const headers = new Headers(init.headers)
  const token = await getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res), parseRetryAfter(res.headers.get('Retry-After')))
  return res
}

export async function getMe(): Promise<Me> {
  return (await apiFetch('/v1/me')).json()
}

export async function pullChanges(since: number, limit = 200): Promise<ChangeSet> {
  const res = await apiFetch(`/v1/sync?since=${encodeURIComponent(since)}&limit=${encodeURIComponent(limit)}`)
  return res.json()
}

/** DELETE /v1/me: borra todos los datos de la cuenta en el servidor y, al
 *  final, la cuenta de Clerk. Responde 204; se puede reintentar. */
export async function deleteAccount(): Promise<void> {
  await apiFetch('/v1/me', { method: 'DELETE' })
}

/** DELETE /v1/data: borra todos los datos de la cuenta en el servidor y
 *  conserva la cuenta. Responde 204. */
export async function deleteCloudData(): Promise<void> {
  await apiFetch('/v1/data', { method: 'DELETE' })
}

export async function pushChanges(changes: PushChangeSet): Promise<PushResult> {
  const res = await apiFetch('/v1/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  return res.json()
}
