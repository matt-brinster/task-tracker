import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { client, db } from '../repository/client.js'
import { ensureIndexes } from '../repository/indexes.js'
import { createUser } from '../domain/user.js'
import { insertUser } from '../repository/user_repository.js'
import { createTestSession } from './test-helpers.js'

beforeAll(async () => {
  await client.connect()
  await ensureIndexes()
})

afterEach(async () => {
  await db().collection('users').deleteMany({})
  await db().collection('sessions').deleteMany({})
})

afterAll(async () => {
  await client.close()
})

describe('GET /users/me', () => {
  it('returns the current user', async () => {
    const user = createUser('alice@example.com')
    await insertUser(user)
    const token = await createTestSession(user.id)

    const res = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(user.id)
    expect(res.body.email).toBe('alice@example.com')
    expect(res.body.isAdmin).toBe(false)
  })

  it('returns isAdmin: true for an admin user', async () => {
    const user = createUser('admin@example.com', true)
    await insertUser(user)
    const token = await createTestSession(user.id)

    const res = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.isAdmin).toBe(true)
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/users/me')

    expect(res.status).toBe(401)
  })
})
