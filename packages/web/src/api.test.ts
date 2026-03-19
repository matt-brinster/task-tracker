import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchApi, redeemInvitation, ApiError } from './api.ts'
import { setToken, getToken } from './auth.ts'

describe('fetchApi', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('attaches the bearer token to requests', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await fetchApi('/tasks/open')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/open')
    const headers = options!.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-token')
  })

  it('sets Content-Type to application/json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await fetchApi('/tasks')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(fetch).mock.calls[0]!
    const headers = options!.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('does not attach Authorization when no token exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await fetchApi('/tasks')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(fetch).mock.calls[0]!
    const headers = options!.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
  })

  it('clears token and reloads on 401', async () => {
    setToken('bad-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 })
    )
    // location.reload throws in jsdom, so mock it
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })

    await expect(fetchApi('/tasks')).rejects.toThrow('Unauthorized')
    expect(getToken()).toBeNull()
    expect(reloadMock).toHaveBeenCalled()
  })
})

describe('redeemInvitation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the token on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 'session-token' }), { status: 201 })
    )

    const token = await redeemInvitation('invitation-key')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(token).toBe('session-token')
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/auth/redeem')
    expect(JSON.parse(options!.body as string)).toEqual({ key: 'invitation-key' })
  })

  it('throws ApiError with server message on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid invitation key' }), { status: 401 })
    )

    try {
      await redeemInvitation('bad-key')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(401)
      expect((err as ApiError).message).toBe('Invalid invitation key')
    }
  })
})
