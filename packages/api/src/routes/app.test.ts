import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { client } from '../repository/client.js'
import { ensureIndexes } from '../repository/indexes.js'
import { createTestSession } from './test-helpers.js'

beforeAll(async () => {
  await client.connect()
  await ensureIndexes()
})

afterAll(async () => {
  await client.close()
})

describe('error handler', () => {
  it('returns 500 with JSON error when a route throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Create a session while connected, then break the DB
    const token = await createTestSession('user-1')
    await client.close()

    const res = await request(app)
      .get('/tasks/open')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal server error')
    expect(res.headers['content-type']).toMatch(/json/)

    // Reconnect for any subsequent tests
    await client.connect()
    spy.mockRestore()
  })
})
