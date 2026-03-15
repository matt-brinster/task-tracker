import { describe, it, expect } from 'vitest'
import { createUser } from './user.js'

describe('createUser', () => {
  it('creates a user with the given email', () => {
    const user = createUser('alice@example.com')
    expect(user.email).toBe('alice@example.com')
  })

  it('generates a unique id for each user', () => {
    const a = createUser('alice@example.com')
    const b = createUser('bob@example.com')
    expect(a.id).not.toBe(b.id)
  })

  it('lowercases the email', () => {
    const user = createUser('Alice@Example.COM')
    expect(user.email).toBe('alice@example.com')
  })

  it('trims whitespace from email', () => {
    const user = createUser('  alice@example.com  ')
    expect(user.email).toBe('alice@example.com')
  })
})
