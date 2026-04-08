import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { client, db } from '../repository/client.js'
import { ensureIndexes } from '../repository/indexes.js'
import { createUser } from '../domain/user.js'
import { insertUser } from '../repository/user_repository.js'
import { createTestSession } from './test-helpers.js'

async function createAdminSession() {
  const user = createUser('admin@example.com', true)
  await insertUser(user)
  const token = await createTestSession(user.id)
  return { user, token }
}

async function createRegularSession() {
  const user = createUser('user@example.com')
  await insertUser(user)
  const token = await createTestSession(user.id)
  return { user, token }
}

beforeAll(async () => {
  await client.connect()
  await ensureIndexes()
})

afterEach(async () => {
  await db().collection('users').deleteMany({})
  await db().collection('invitations').deleteMany({})
  await db().collection('sessions').deleteMany({})
})

afterAll(async () => {
  await client.close()
})

describe('admin middleware', () => {
  it('returns 403 for a non-admin user', async () => {
    const { token } = await createRegularSession()

    const res = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new@example.com' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Forbidden')
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app)
      .post('/admin/users')
      .send({ email: 'new@example.com' })

    expect(res.status).toBe(401)
  })
})

describe('POST /admin/users', () => {
  it('creates a user and returns an invitation key', async () => {
    const { token } = await createAdminSession()

    const res = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new@example.com' })

    expect(res.status).toBe(201)
    expect(res.body.email).toBe('new@example.com')
    expect(res.body.userId).toEqual(expect.any(String))
    expect(res.body.invitationKey).toEqual(expect.any(String))
    expect(res.body.invitationKey.length).toBeGreaterThan(0)
  })

  it('stores the new user in the database', async () => {
    const { token } = await createAdminSession()

    const res = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new@example.com' })

    const doc = await db().collection<{ _id: string; email: string }>('users').findOne({ _id: res.body.userId })
    expect(doc).not.toBeNull()
    expect(doc!['email']).toBe('new@example.com')
  })

  it('stores an invitation in the database', async () => {
    const { token } = await createAdminSession()

    const res = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new@example.com' })

    const doc = await db().collection('invitations').findOne({ userId: res.body.userId })
    expect(doc).not.toBeNull()
  })

  it('returns 400 when email is missing', async () => {
    const { token } = await createAdminSession()

    const res = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/email is required/)
  })

  it('returns 400 when email is empty', async () => {
    const { token } = await createAdminSession()

    const res = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/email is required/)
  })

  it('returns 409 when email already exists', async () => {
    const { token } = await createAdminSession()
    await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new@example.com' })

    const res = await request(app)
      .post('/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new@example.com' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/)
  })
})
