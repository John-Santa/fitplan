import { getAuthToken } from '../account/lib/auth'
import type { ChangeSet, Me, PushChangeSet, PushResult } from './syncTypes'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
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
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
  return res
}

export async function getMe(): Promise<Me> {
  return (await apiFetch('/v1/me')).json()
}

export async function pullChanges(since: number, limit = 200): Promise<ChangeSet> {
  const res = await apiFetch(`/v1/sync?since=${encodeURIComponent(since)}&limit=${encodeURIComponent(limit)}`)
  return res.json()
}

export async function pushChanges(changes: PushChangeSet): Promise<PushResult> {
  const res = await apiFetch('/v1/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  return res.json()
}
