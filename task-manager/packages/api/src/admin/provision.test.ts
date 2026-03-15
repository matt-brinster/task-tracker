import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { client, db } from '../repository/client.js'
import { provision } from './provision.js'

beforeAll(async () => {
  await client.connect()
})

afterEach(async () => {
  await db().collection('users').deleteMany({})
  await db().collection('invitations').deleteMany({})
})

afterAll(async () => {
  await client.close()
})

describe('provision', () => {
  it('creates a user and returns an invitation key', async () => {
    const result = await provision('alice@example.com')

    expect(result.email).toBe('alice@example.com')
    expect(result.userId).toEqual(expect.any(String))
    expect(result.rawToken).toEqual(expect.any(String))
    expect(result.rawToken.length).toBeGreaterThan(0)
  })

  it('stores the user in the database', async () => {
    const result = await provision('bob@example.com')

    const doc = await db().collection<{ _id: string; email: string }>('users').findOne({ _id: result.userId })
    expect(doc).not.toBeNull()
    expect(doc!['email']).toBe('bob@example.com')
  })

  it('stores an invitation in the database', async () => {
    const result = await provision('carol@example.com')

    const doc = await db().collection('invitations').findOne({ userId: result.userId })
    expect(doc).not.toBeNull()
    expect(doc!['sessionCount']).toBe(0)
  })

  it('normalizes email to lowercase and trimmed', async () => {
    const result = await provision('  Alice@Example.COM  ')

    expect(result.email).toBe('alice@example.com')
  })

  it('throws if the email already exists', async () => {
    await provision('alice@example.com')

    await expect(provision('alice@example.com')).rejects.toThrow('already exists')
  })

  it('throws if the email matches after normalization', async () => {
    await provision('alice@example.com')

    await expect(provision('  ALICE@example.com  ')).rejects.toThrow('already exists')
  })
})
