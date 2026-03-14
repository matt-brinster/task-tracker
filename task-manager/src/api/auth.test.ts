import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { client, db } from '../repository/client.js'
import { ensureIndexes } from '../repository/indexes.js'
import { createInvitation } from '../domain/invitation.js'
import { insertInvitation } from '../repository/invitation_repository.js'

beforeAll(async () => {
  await client.connect()
  await ensureIndexes()
})

afterEach(async () => {
  await db().collection('invitations').deleteMany({})
  await db().collection('sessions').deleteMany({})
})

afterAll(async () => {
  await client.close()
})

describe('POST /auth/redeem', () => {
  it('returns a session token for a valid invitation key', async () => {
    const { invitation, rawToken } = createInvitation('user-1')
    await insertInvitation(invitation)

    const res = await request(app)
      .post('/auth/redeem')
      .send({ key: rawToken })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(typeof res.body.token).toBe('string')
  })

  it('returns a token that works as a bearer token', async () => {
    const { invitation, rawToken } = createInvitation('user-1')
    await insertInvitation(invitation)

    const redeemRes = await request(app)
      .post('/auth/redeem')
      .send({ key: rawToken })

    const bearerToken = redeemRes.body.token

    // Use the bearer token to access a protected route
    const taskRes = await request(app)
      .get('/tasks/open')
      .set('Authorization', `Bearer ${bearerToken}`)

    expect(taskRes.status).toBe(200)
  })

  it('allows the same invitation key to be redeemed multiple times', async () => {
    const { invitation, rawToken } = createInvitation('user-1')
    await insertInvitation(invitation)

    const res1 = await request(app)
      .post('/auth/redeem')
      .send({ key: rawToken })

    const res2 = await request(app)
      .post('/auth/redeem')
      .send({ key: rawToken })

    expect(res1.status).toBe(201)
    expect(res2.status).toBe(201)
    // Each redemption creates a different session token
    expect(res1.body.token).not.toBe(res2.body.token)
  })

  it('returns 403 when session limit is reached', async () => {
    const { invitation, rawToken } = createInvitation('user-1')
    // Set sessionCount to the limit
    invitation.sessionCount = 10
    await insertInvitation(invitation)

    const res = await request(app)
      .post('/auth/redeem')
      .send({ key: rawToken })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/session limit/)
  })

  it('returns 401 for an invalid key', async () => {
    const res = await request(app)
      .post('/auth/redeem')
      .send({ key: 'bogus-key' })

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Invalid invitation key/)
  })

  it('returns 400 when key is missing', async () => {
    const res = await request(app)
      .post('/auth/redeem')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing key/)
  })

  it('returns 400 when key is empty', async () => {
    const res = await request(app)
      .post('/auth/redeem')
      .send({ key: '' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing key/)
  })

  it('increments sessionCount on the invitation', async () => {
    const { invitation, rawToken } = createInvitation('user-1')
    await insertInvitation(invitation)

    await request(app)
      .post('/auth/redeem')
      .send({ key: rawToken })

    await request(app)
      .post('/auth/redeem')
      .send({ key: rawToken })

    const doc = await db().collection('invitations').findOne({ _id: invitation.id })
    expect(doc?.sessionCount).toBe(2)
  })
})

describe('bearer token auth middleware', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/tasks/open')

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Missing or invalid Authorization header/)
  })

  it('returns 401 with non-Bearer Authorization header', async () => {
    const res = await request(app)
      .get('/tasks/open')
      .set('Authorization', 'Basic abc123')

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Missing or invalid Authorization header/)
  })

  it('returns 401 with an invalid bearer token', async () => {
    const res = await request(app)
      .get('/tasks/open')
      .set('Authorization', 'Bearer invalid-token')

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Invalid session token/)
  })
})
