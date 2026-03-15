import { describe, it, expect } from 'vitest'
import { generateToken, hashToken } from './crypto.js'
import { createInvitation } from './invitation.js'
import { createSession } from './session.js'

describe('generateToken', () => {
  it('returns a base64url string of 43 characters', () => {
    const token = generateToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()))
    expect(tokens.size).toBe(100)
  })
})

describe('hashToken', () => {
  it('returns a 64-character hex string', () => {
    const hash = hashToken('test-token')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(hashToken('same-input')).toBe(hashToken('same-input'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
  })
})

describe('createInvitation', () => {
  it('returns an invitation and raw token', () => {
    const { invitation, rawToken } = createInvitation('user-1')
    expect(invitation.userId).toBe('user-1')
    expect(invitation.sessionCount).toBe(0)
    expect(invitation.createdAt).toBeInstanceOf(Date)
    expect(invitation.id).toBeDefined()
    expect(rawToken).toBeDefined()
  })

  it('stores the hash of the raw token, not the raw token itself', () => {
    const { invitation, rawToken } = createInvitation('user-1')
    expect(invitation.tokenHash).toBe(hashToken(rawToken))
    expect(invitation.tokenHash).not.toBe(rawToken)
  })

  it('generates a unique token per invitation', () => {
    const a = createInvitation('user-1')
    const b = createInvitation('user-1')
    expect(a.invitation.tokenHash).not.toBe(b.invitation.tokenHash)
  })
})

describe('createSession', () => {
  it('returns a session and raw token', () => {
    const { session, rawToken } = createSession('user-1')
    expect(session.userId).toBe('user-1')
    expect(session.createdAt).toBeInstanceOf(Date)
    expect(session.lastUsedAt).toBeInstanceOf(Date)
    expect(session.id).toBeDefined()
    expect(rawToken).toBeDefined()
  })

  it('stores the hash of the raw token, not the raw token itself', () => {
    const { session, rawToken } = createSession('user-1')
    expect(session.tokenHash).toBe(hashToken(rawToken))
    expect(session.tokenHash).not.toBe(rawToken)
  })

  it('sets createdAt and lastUsedAt to the same time', () => {
    const { session } = createSession('user-1')
    expect(session.createdAt).toEqual(session.lastUsedAt)
  })
})
