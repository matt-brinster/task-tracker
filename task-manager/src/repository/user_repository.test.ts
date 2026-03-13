import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { client, db } from './client.js'
import { createUser } from '../domain/user.js'
import { insertUser, findUserById, findUserByEmail } from './user_repository.js'

describe('user repository', () => {
  beforeAll(async () => {
    await client.connect()
  })

  afterEach(async () => {
    await db().collection('users').deleteMany({})
  })

  afterAll(async () => {
    await client.close()
  })

  describe('insertUser', () => {
    it('inserts a user and stores it as a document', async () => {
      const user = createUser('alice@example.com')
      await insertUser(user)

      const doc = await db().collection('users').findOne({ _id: user.id })
      expect(doc).not.toBeNull()
      expect(doc!._id).toBe(user.id)
      expect(doc!.email).toBe('alice@example.com')
    })

    it('rejects duplicate user ids', async () => {
      const user = createUser('alice@example.com')
      await insertUser(user)

      await expect(insertUser(user)).rejects.toThrow()
    })
  })

  describe('findUserById', () => {
    it('returns a user by id', async () => {
      const user = createUser('alice@example.com')
      await insertUser(user)

      const found = await findUserById(user.id)
      expect(found).toEqual(user)
    })

    it('returns null when the user does not exist', async () => {
      const found = await findUserById('nonexistent-id')
      expect(found).toBeNull()
    })
  })

  describe('findUserByEmail', () => {
    it('returns a user by email', async () => {
      const user = createUser('alice@example.com')
      await insertUser(user)

      const found = await findUserByEmail('alice@example.com')
      expect(found).toEqual(user)
    })

    it('returns null when the email does not exist', async () => {
      const found = await findUserByEmail('nobody@example.com')
      expect(found).toBeNull()
    })
  })
})
