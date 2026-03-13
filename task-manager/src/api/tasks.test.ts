import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { client, db } from '../repository/client.js'
import { ensureIndexes } from '../repository/indexes.js'
import { createTask } from '../domain/task.js'
import { completeTask, deleteTask, snoozeTask } from '../domain/task_operations.js'
import { insertTask, updateTask } from '../repository/task_repository.js'

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

describe('GET /tasks/open', () => {
  it('returns 401 without X-User-Id header', async () => {
    const res = await request(app).get('/tasks/open')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Missing X-User-Id header')
  })

  it('returns an empty array when the user has no tasks', async () => {
    const res = await request(app)
      .get('/tasks/open')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns open tasks for the authenticated user', async () => {
    const task = createTask('user-1', 'Buy milk', 'whole milk')
    await insertTask(task)

    const res = await request(app)
      .get('/tasks/open')
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
      .get('/tasks/open')
      .set('X-User-Id', 'user-1')

    expect(res.body[0]).not.toHaveProperty('userId')
    expect(res.body[0]).not.toHaveProperty('deletedAt')
  })

  it('does not return tasks belonging to other users', async () => {
    await insertTask(createTask('user-1', 'My task'))
    await insertTask(createTask('user-2', 'Their task'))

    const res = await request(app)
      .get('/tasks/open')
      .set('X-User-Id', 'user-1')

    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('My task')
  })
})

describe('GET /tasks/:id', () => {
  it('returns a task by id', async () => {
    const task = createTask('user-1', 'Buy milk', 'whole milk')
    await insertTask(task)

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(task.id)
    expect(res.body.title).toBe('Buy milk')
    expect(res.body.details).toBe('whole milk')
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .get('/tasks/nonexistent-id')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Task not found')
  })

  it('returns 404 when the task belongs to a different user', async () => {
    const task = createTask('user-1', 'Private task')
    await insertTask(task)

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-2')

    expect(res.status).toBe(404)
  })

  it('returns 404 for soft-deleted tasks', async () => {
    const task = createTask('user-1', 'Doomed task')
    await insertTask(task)
    await updateTask(task, deleteTask(task, new Date()))

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(404)
  })

  it('does not include userId or deletedAt in the response', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    expect(res.body).not.toHaveProperty('userId')
    expect(res.body).not.toHaveProperty('deletedAt')
  })
})

describe('POST /tasks', () => {
  it('creates a task with just a title', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('X-User-Id', 'user-1')
      .send({ title: 'Buy milk' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.title).toBe('Buy milk')
    expect(res.body.details).toBe('')
    expect(res.body.queue).toBe('todo')
  })

  it('creates a task with details and queue', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('X-User-Id', 'user-1')
      .send({ title: 'Sort backlog', details: 'review priorities', queue: 'backlog' })

    expect(res.status).toBe(201)
    expect(res.body.details).toBe('review priorities')
    expect(res.body.queue).toBe('backlog')
  })

  it('persists the task to the database', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('X-User-Id', 'user-1')
      .send({ title: 'Buy milk' })

    const getRes = await request(app)
      .get(`/tasks/${res.body.id}`)
      .set('X-User-Id', 'user-1')

    expect(getRes.status).toBe(200)
    expect(getRes.body.title).toBe('Buy milk')
  })

  it('trims whitespace from the title', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('X-User-Id', 'user-1')
      .send({ title: '  Buy milk  ' })

    expect(res.body.title).toBe('Buy milk')
  })

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('X-User-Id', 'user-1')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('title is required')
  })

  it('returns 400 when title is empty', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('X-User-Id', 'user-1')
      .send({ title: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('title is required')
  })

  it('returns 400 for invalid queue value', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('X-User-Id', 'user-1')
      .send({ title: 'Buy milk', queue: 'urgent' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('queue must be "todo" or "backlog"')
  })

  it('does not include userId or deletedAt in the response', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('X-User-Id', 'user-1')
      .send({ title: 'Buy milk' })

    expect(res.body).not.toHaveProperty('userId')
    expect(res.body).not.toHaveProperty('deletedAt')
  })
})

describe('DELETE /tasks/:id', () => {
  it('soft-deletes a task and returns 204', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .delete(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(204)
  })

  it('makes the task invisible to GET /tasks/:id', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .delete(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    expect(getRes.status).toBe(404)
  })

  it('makes the task invisible to GET /tasks/open', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .delete(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    const listRes = await request(app)
      .get('/tasks/open')
      .set('X-User-Id', 'user-1')

    expect(listRes.body).toEqual([])
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .delete('/tasks/nonexistent-id')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(404)
  })

  it('returns 404 when the task belongs to a different user', async () => {
    const task = createTask('user-1', 'Private task')
    await insertTask(task)

    const res = await request(app)
      .delete(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-2')

    expect(res.status).toBe(404)
  })
})

describe('POST /tasks/:id/complete', () => {
  it('completes a task and returns it', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/complete`)
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(task.id)
    expect(res.body.completedAt).not.toBeNull()
  })

  it('persists the completion', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .post(`/tasks/${task.id}/complete`)
      .set('X-User-Id', 'user-1')

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    expect(getRes.body.completedAt).not.toBeNull()
  })

  it('removes the task from GET /tasks/open', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .post(`/tasks/${task.id}/complete`)
      .set('X-User-Id', 'user-1')

    const listRes = await request(app)
      .get('/tasks/open')
      .set('X-User-Id', 'user-1')

    expect(listRes.body).toEqual([])
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/complete')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(404)
  })

  it('returns 404 when the task belongs to a different user', async () => {
    const task = createTask('user-1', 'Private task')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/complete`)
      .set('X-User-Id', 'user-2')

    expect(res.status).toBe(404)
  })
})

describe('POST /tasks/:id/reopen', () => {
  it('reopens a completed task', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)
    await updateTask(task, completeTask(task, new Date()))

    const res = await request(app)
      .post(`/tasks/${task.id}/reopen`)
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeNull()
  })

  it('returns the task to GET /tasks/open', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)
    await updateTask(task, completeTask(task, new Date()))

    await request(app)
      .post(`/tasks/${task.id}/reopen`)
      .set('X-User-Id', 'user-1')

    const listRes = await request(app)
      .get('/tasks/open')
      .set('X-User-Id', 'user-1')

    expect(listRes.body).toHaveLength(1)
    expect(listRes.body[0].title).toBe('Buy milk')
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/reopen')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(404)
  })
})

describe('POST /tasks/:id/snooze', () => {
  it('snoozes a task until the given date', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/snooze`)
      .set('X-User-Id', 'user-1')
      .send({ until: '2026-04-01T12:00:00Z' })

    expect(res.status).toBe(200)
    expect(res.body.snoozedUntil).toBe('2026-04-01T12:00:00.000Z')
  })

  it('persists the snooze', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .post(`/tasks/${task.id}/snooze`)
      .set('X-User-Id', 'user-1')
      .send({ until: '2026-04-01T12:00:00Z' })

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    expect(getRes.body.snoozedUntil).toBe('2026-04-01T12:00:00.000Z')
  })

  it('returns 400 when until is missing', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/snooze`)
      .set('X-User-Id', 'user-1')
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/until is required/)
  })

  it('returns 400 for an invalid date', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/snooze`)
      .set('X-User-Id', 'user-1')
      .send({ until: 'not-a-date' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/valid ISO 8601/)
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/snooze')
      .set('X-User-Id', 'user-1')
      .send({ until: '2026-04-01T12:00:00Z' })

    expect(res.status).toBe(404)
  })
})

describe('POST /tasks/:id/wake', () => {
  it('clears snoozedUntil on a snoozed task', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)
    await updateTask(task, snoozeTask(task, new Date('2026-04-01T12:00:00Z')))

    const res = await request(app)
      .post(`/tasks/${task.id}/wake`)
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body.snoozedUntil).toBeNull()
  })

  it('persists the wake', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)
    await updateTask(task, snoozeTask(task, new Date('2026-04-01T12:00:00Z')))

    await request(app)
      .post(`/tasks/${task.id}/wake`)
      .set('X-User-Id', 'user-1')

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    expect(getRes.body.snoozedUntil).toBeNull()
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/wake')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(404)
  })
})

describe('GET /tasks/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app)
      .get('/tasks/open/search')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/q query parameter is required/)
  })

  it('returns 400 when q is empty', async () => {
    const res = await request(app)
      .get('/tasks/open/search?q=')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/q query parameter is required/)
  })

  it('returns 400 when q is only whitespace', async () => {
    const res = await request(app)
      .get('/tasks/open/search?q=%20%20')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/q query parameter is required/)
  })

  it('returns matching tasks', async () => {
    await insertTask(createTask('user-1', 'Buy groceries', 'milk and eggs'))
    await insertTask(createTask('user-1', 'Fix the roof'))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Buy groceries')
  })

  it('returns an empty array when nothing matches', async () => {
    await insertTask(createTask('user-1', 'Buy groceries'))

    const res = await request(app)
      .get('/tasks/open/search?q=unicorn')
      .set('X-User-Id', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('does not return tasks belonging to other users', async () => {
    await insertTask(createTask('user-1', 'Buy groceries'))
    await insertTask(createTask('user-2', 'Buy groceries'))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set('X-User-Id', 'user-1')

    expect(res.body).toHaveLength(1)
  })

  it('does not return deleted tasks', async () => {
    const task = createTask('user-1', 'Buy groceries')
    await insertTask(task)
    await updateTask(task, deleteTask(task, new Date()))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set('X-User-Id', 'user-1')

    expect(res.body).toEqual([])
  })

  it('does not return completed tasks', async () => {
    const task = createTask('user-1', 'Buy groceries')
    await insertTask(task)
    await updateTask(task, completeTask(task, new Date()))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set('X-User-Id', 'user-1')

    expect(res.body).toEqual([])
  })

  it('does not include userId or deletedAt in the response', async () => {
    await insertTask(createTask('user-1', 'Buy groceries'))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set('X-User-Id', 'user-1')

    expect(res.body[0]).not.toHaveProperty('userId')
    expect(res.body[0]).not.toHaveProperty('deletedAt')
  })

  it('matches on details text', async () => {
    await insertTask(createTask('user-1', 'Shopping', 'need bananas'))

    const res = await request(app)
      .get('/tasks/open/search?q=bananas')
      .set('X-User-Id', 'user-1')

    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Shopping')
  })
})

describe('POST /tasks/:id/queue', () => {
  it('moves a task to backlog', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/queue`)
      .set('X-User-Id', 'user-1')
      .send({ queue: 'backlog' })

    expect(res.status).toBe(200)
    expect(res.body.queue).toBe('backlog')
  })

  it('moves a task back to todo', async () => {
    const task = createTask('user-1', 'Buy milk', '', 'backlog')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/queue`)
      .set('X-User-Id', 'user-1')
      .send({ queue: 'todo' })

    expect(res.status).toBe(200)
    expect(res.body.queue).toBe('todo')
  })

  it('persists the queue change', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .post(`/tasks/${task.id}/queue`)
      .set('X-User-Id', 'user-1')
      .send({ queue: 'backlog' })

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set('X-User-Id', 'user-1')

    expect(getRes.body.queue).toBe('backlog')
  })

  it('returns 400 for invalid queue value', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/queue`)
      .set('X-User-Id', 'user-1')
      .send({ queue: 'urgent' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('queue must be "todo" or "backlog"')
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/queue')
      .set('X-User-Id', 'user-1')
      .send({ queue: 'backlog' })

    expect(res.status).toBe(404)
  })
})
