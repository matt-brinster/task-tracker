import { getToken, clearToken } from './auth.ts'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()

  const headers = new Headers(options.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  headers.set('Content-Type', 'application/json')

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    // A 401 means our session token is no longer valid (revoked, expired, etc.).
    // Clear the dead token and force a full page reload. Since there's no token
    // in localStorage after clearing, React will render the login screen.
    // This is simpler than threading auth state back into React from the API layer.
    clearToken()
    window.location.reload()
    throw new ApiError(401, 'Unauthorized')
  }

  return response
}

export async function redeemInvitation(key: string): Promise<string> {
  const response = await fetch('/api/auth/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })

  if (!response.ok) {
    const body = await response.json() as { error: string }
    throw new ApiError(response.status, body.error)
  }

  const body = await response.json() as { token: string }
  return body.token
}
