import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { client, db } from '../repository/client.js'
import { ensureIndexes } from '../repository/indexes.js'
import { createInvitation } from '../domain/invitation.js'
import { insertInvitation } from '../repository/invitation_repository.js'
import { createTestSession } from './test-helpers.js'

// Override the skip so rate limiting is active in these tests
vi.mock('./rate-limit.js', async () => {
  const mod = await import('express-rate-limit')
  const rateLimit = mod.default
  const ipKeyGenerator = mod.ipKeyGenerator
  return {
    ipLimiter: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 3, // low limit for testing
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later' },
    }),
    userLimiter: rateLimit({
      windowMs: 60 * 1000,
      limit: 3, // low limit for testing
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (req: any) => req.userId ?? ipKeyGenerator(req.ip ?? 'unknown'),
      message: { error: 'Too many requests, please try again later' },
    }),
  }
})

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

describe('IP rate limiting on /auth', () => {
  it('returns 429 after exceeding the limit', async () => {
    const { invitation, rawToken } = createInvitation('user-1')
    await insertInvitation(invitation)

    // Send requests up to the limit
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/auth/redeem')
        .send({ key: rawToken })
      expect(res.status).not.toBe(429)
    }

    // Next request should be rate limited
    const res = await request(app)
      .post('/auth/redeem')
      .send({ key: rawToken })

    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/Too many requests/)
  })
})

describe('user rate limiting on /tasks', () => {
  it('returns 429 after exceeding the limit', async () => {
    const token = await createTestSession('user-1')

    // Send requests up to the limit
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .get('/tasks/open')
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
    }

    // Next request should be rate limited
    const res = await request(app)
      .get('/tasks/open')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/Too many requests/)
  })
})
