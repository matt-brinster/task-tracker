import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { client } from './client.js'

describe('MongoDB client', () => {
  beforeAll(async () => {
    await client.connect()
  })

  afterAll(async () => {
    await client.close()
  })

  it('can ping the database', async () => {
    const result = await client.db().command({ ping: 1 })
    expect(result['ok']).toBe(1)
  })
})
