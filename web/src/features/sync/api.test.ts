import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, getMe, pullChanges, pushChanges } from './api'
import { setTokenGetter } from '../account/lib/auth'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('apiFetch', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/')
    setTokenGetter(async () => 'tok-123')
  })
  afterEach(() => {
    setTokenGetter(null)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('arma la URL sobre VITE_API_URL y agrega el header Bearer', async () => {
    fetchMock.mockResolvedValue(json({ userId: 'u1' }))
    await apiFetch('/v1/me')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.test/v1/me')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok-123')
  })

  it('no agrega Authorization si no hay token', async () => {
    setTokenGetter(async () => null)
    fetchMock.mockResolvedValue(json({}))
    await apiFetch('/v1/me')
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Authorization')).toBe(false)
  })

  it('lanza ApiError tipado con el mensaje JSON en un no-2xx', async () => {
    fetchMock.mockResolvedValue(json({ type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'token inválido' }, 401))
    const err = await apiFetch('/v1/me').catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.message).toBe('token inválido')
  })

  it('cae a un mensaje con el status si el cuerpo no es JSON', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 502 }))
    const err = await apiFetch('/v1/me').catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
    expect(err.message).toContain('502')
  })

  it('lanza ApiError sin llamar a fetch si falta VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', '')
    await expect(apiFetch('/v1/me')).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('helpers tipados', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('VITE_API_URL', 'https://api.example.test')
    setTokenGetter(async () => 't')
  })
  afterEach(() => {
    setTokenGetter(null)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('getMe llama GET /v1/me', async () => {
    fetchMock.mockResolvedValue(json({ userId: 'u1' }))
    expect(await getMe()).toEqual({ userId: 'u1' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/v1/me')
  })

  it('pullChanges pasa since y limit en el query', async () => {
    fetchMock.mockResolvedValue(json({ documents: [], sessions: [], measurements: [], exerciseMeta: [], cursor: 7, hasMore: false }))
    const cs = await pullChanges(5, 100)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/v1/sync?since=5&limit=100')
    expect(cs.cursor).toBe(7)
  })

  it('pushChanges hace POST /v1/sync con el changeset como JSON', async () => {
    fetchMock.mockResolvedValue(json({ results: [] }))
    const cs = { documents: [], sessions: [], measurements: [], exerciseMeta: [] }
    await pushChanges(cs)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.test/v1/sync')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(cs)
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })
})
