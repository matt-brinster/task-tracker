import { describe, it, expect, beforeEach } from 'vitest'
import { getToken, setToken, clearToken } from './auth.ts'

describe('auth token helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when no token is stored', () => {
    expect(getToken()).toBeNull()
  })

  it('stores and retrieves a token', () => {
    setToken('my-token')
    expect(getToken()).toBe('my-token')
  })

  it('clears a stored token', () => {
    setToken('my-token')
    clearToken()
    expect(getToken()).toBeNull()
  })

  it('overwrites an existing token', () => {
    setToken('first')
    setToken('second')
    expect(getToken()).toBe('second')
  })
})
