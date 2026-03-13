import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { client, db } from '../repository/client.js'
import { ensureIndexes } from '../repository/indexes.js'
import { createTask } from '../domain/task.js'
import { insertTask } from '../repository/task_repository.js'

describe('GET /tasks', () => {
  beforeAll(async () => {
    await client.connect()
    await ensureIndexes()
  })

  afterEach(async () => {
    await db().collection('tasks').deleteMany({})
  })

  afterAll(async () => {
    await client.close()
  })

  it('returns 401 without X-User-Id header', async () => {
    const res = await request(app).get('/tasks')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing X-User-Id header')
  })

  it('returns an empty array when the user has no tasks', async () => {
    const res = await request(app)
      .get('/tasks')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns open tasks for the authenticated user', async () => {
    const task = createTask('user-1', 'Buy milk', 'whole milk')
    await insertTask(task)

    const res = await request(app)
      .get('/tasks')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].id).toBe(task.id)
    expect(res.body[0].title).toBe('Buy milk')
    expect(res.body[0].details).toBe('whole milk')
    expect(res.body[0].queue).toBe('todo')
  })

  it('does not include userId or deletedAt in the response', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .get('/tasks')
      .set('X-User-Id', 'user-1')

    expect(res.body[0]).not.toHaveProperty('userId')
    expect(res.body[0]).not.toHaveProperty('deletedAt')
  })

  it('does not return tasks belonging to other users', async () => {
    await insertTask(createTask('user-1', 'My task'))
    await insertTask(createTask('user-2', 'Their task'))

    const res = await request(app)
      .get('/tasks')
      .set('X-User-Id', 'user-1')

    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('My task')
  })
})
