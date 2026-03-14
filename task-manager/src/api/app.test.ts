import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { client } from '../repository/client.js'

beforeAll(async () => {
  await client.connect()
})

afterAll(async () => {
  await client.close()
})

describe('error handler', () => {
  it('returns 500 with JSON error when a route throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Close the client to break DB access, then make a request
    await client.close()

    const res = await request(app)
      .get('/tasks/open')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal server error')
    expect(res.headers['content-type']).toMatch(/json/)

    // Reconnect for any subsequent tests
    await client.connect()
    spy.mockRestore()
  })
})
