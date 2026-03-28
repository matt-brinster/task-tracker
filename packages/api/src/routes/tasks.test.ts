import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import app from './app.js'
import { client, db } from '../repository/client.js'
import { ensureIndexes } from '../repository/indexes.js'
import { createTask } from '../domain/task.js'
import { completeTask, deleteTask, snoozeTask, addBlockers, archiveTask } from '../domain/task_operations.js'
import { insertTask, updateTask, softDeleteTask } from '../repository/task_repository.js'
import { createTestSession } from './test-helpers.js'

let token1: string
let token2: string

beforeAll(async () => {
  await client.connect()
  await ensureIndexes()
})

beforeEach(async () => {
  token1 = await createTestSession('user-1')
  token2 = await createTestSession('user-2')
})

afterEach(async () => {
  await db().collection('tasks').deleteMany({})
  await db().collection('sessions').deleteMany({})
})

afterAll(async () => {
  await client.close()
})

function auth(token: string) {
  return ['Authorization', `Bearer ${token}`] as const
}

describe('GET /tasks/open', () => {
  it('returns an empty array when the user has no tasks', async () => {
    const res = await request(app)
      .get('/tasks/open')
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns open tasks for the authenticated user', async () => {
    const task = createTask('user-1', 'Buy milk', { details: 'whole milk' })
    await insertTask(task)

    const res = await request(app)
      .get('/tasks/open')
      .set(...auth(token1))

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
      .set(...auth(token1))

    expect(res.body[0]).not.toHaveProperty('userId')
    expect(res.body[0]).not.toHaveProperty('deletedAt')
  })

  it('does not return tasks belonging to other users', async () => {
    await insertTask(createTask('user-1', 'My task'))
    await insertTask(createTask('user-2', 'Their task'))

    const res = await request(app)
      .get('/tasks/open')
      .set(...auth(token1))

    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('My task')
  })
})

describe('GET /tasks/active', () => {
  it('returns an empty array when the user has no tasks', async () => {
    const res = await request(app)
      .get('/tasks/active')
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns open tasks', async () => {
    await insertTask(createTask('user-1', 'Buy milk'))

    const res = await request(app)
      .get('/tasks/active')
      .set(...auth(token1))

    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Buy milk')
  })

  it('returns completed tasks (not yet archived)', async () => {
    const task = createTask('user-1', 'Buy milk')
    const completed = completeTask(task, new Date())
    await insertTask(completed)

    const res = await request(app)
      .get('/tasks/active')
      .set(...auth(token1))

    expect(res.body).toHaveLength(1)
    expect(res.body[0].completedAt).not.toBeNull()
  })

  it('does not return archived tasks', async () => {
    const task = createTask('user-1', 'Buy milk')
    const completed = completeTask(task, new Date())
    const archived = archiveTask(completed, new Date())
    await insertTask(archived)

    const res = await request(app)
      .get('/tasks/active')
      .set(...auth(token1))

    expect(res.body).toEqual([])
  })

  it('does not return deleted tasks', async () => {
    const task = createTask('user-1', 'Buy milk')
    const deleted = deleteTask(task, new Date())
    await insertTask(deleted)

    const res = await request(app)
      .get('/tasks/active')
      .set(...auth(token1))

    expect(res.body).toEqual([])
  })

  it('does not return tasks belonging to other users', async () => {
    await insertTask(createTask('user-1', 'My task'))
    await insertTask(createTask('user-2', 'Their task'))

    const res = await request(app)
      .get('/tasks/active')
      .set(...auth(token1))

    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('My task')
  })
})

describe('POST /tasks/archive', () => {
  it('archives the specified tasks and returns the count', async () => {
    const t1 = createTask('user-1', 'Task 1')
    const t2 = createTask('user-1', 'Task 2')
    const c1 = completeTask(t1, new Date())
    const c2 = completeTask(t2, new Date())
    await insertTask(c1)
    await insertTask(c2)

    const res = await request(app)
      .post('/tasks/archive')
      .set(...auth(token1))
      .send({ taskIds: [c1.id, c2.id] })

    expect(res.status).toBe(200)
    expect(res.body.archivedCount).toBe(2)
  })

  it('archived tasks no longer appear in GET /tasks/active', async () => {
    const task = createTask('user-1', 'Buy milk')
    const completed = completeTask(task, new Date())
    await insertTask(completed)

    await request(app)
      .post('/tasks/archive')
      .set(...auth(token1))
      .send({ taskIds: [task.id] })

    const res = await request(app)
      .get('/tasks/active')
      .set(...auth(token1))

    expect(res.body).toEqual([])
  })

  it('does not archive tasks belonging to other users', async () => {
    const task = createTask('user-2', 'Their task')
    await insertTask(task)

    const res = await request(app)
      .post('/tasks/archive')
      .set(...auth(token1))
      .send({ taskIds: [task.id] })

    expect(res.body.archivedCount).toBe(0)
  })

  it('ignores IDs that do not exist', async () => {
    const res = await request(app)
      .post('/tasks/archive')
      .set(...auth(token1))
      .send({ taskIds: ['nonexistent-id'] })

    expect(res.status).toBe(200)
    expect(res.body.archivedCount).toBe(0)
  })

  it('returns 400 when taskIds is missing', async () => {
    const res = await request(app)
      .post('/tasks/archive')
      .set(...auth(token1))
      .send({})

    expect(res.status).toBe(400)
  })

  it('returns 400 when taskIds is empty', async () => {
    const res = await request(app)
      .post('/tasks/archive')
      .set(...auth(token1))
      .send({ taskIds: [] })

    expect(res.status).toBe(400)
  })
})

describe('GET /tasks/:id', () => {
  it('returns a task by id', async () => {
    const task = createTask('user-1', 'Buy milk', { details: 'whole milk' })
    await insertTask(task)

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(task.id)
    expect(res.body.title).toBe('Buy milk')
    expect(res.body.details).toBe('whole milk')
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .get('/tasks/nonexistent-id')
      .set(...auth(token1))

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Task not found')
  })

  it('returns 404 when the task belongs to a different user', async () => {
    const task = createTask('user-1', 'Private task')
    await insertTask(task)

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token2))

    expect(res.status).toBe(404)
  })

  it('returns 404 for soft-deleted tasks', async () => {
    const task = createTask('user-1', 'Doomed task')
    await insertTask(task)
    await softDeleteTask(task, deleteTask(task, new Date()))

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(res.status).toBe(404)
  })

  it('does not include userId or deletedAt in the response', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(res.body).not.toHaveProperty('userId')
    expect(res.body).not.toHaveProperty('deletedAt')
  })
})

describe('POST /tasks', () => {
  it('creates a task with just a title', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(...auth(token1))
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
      .set(...auth(token1))
      .send({ title: 'Sort backlog', details: 'review priorities', queue: 'backlog' })

    expect(res.status).toBe(201)
    expect(res.body.details).toBe('review priorities')
    expect(res.body.queue).toBe('backlog')
  })

  it('persists the task to the database', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(...auth(token1))
      .send({ title: 'Buy milk' })

    const getRes = await request(app)
      .get(`/tasks/${res.body.id}`)
      .set(...auth(token1))

    expect(getRes.status).toBe(200)
    expect(getRes.body.title).toBe('Buy milk')
  })

  it('trims whitespace from the title', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(...auth(token1))
      .send({ title: '  Buy milk  ' })

    expect(res.body.title).toBe('Buy milk')
  })

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(...auth(token1))
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('title is required')
  })

  it('returns 400 when title is empty', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(...auth(token1))
      .send({ title: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('title is required')
  })

  it('returns 400 for invalid queue value', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(...auth(token1))
      .send({ title: 'Buy milk', queue: 'urgent' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('queue must be "todo" or "backlog"')
  })

  it('does not include userId or deletedAt in the response', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(...auth(token1))
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
      .set(...auth(token1))

    expect(res.status).toBe(204)
  })

  it('makes the task invisible to GET /tasks/:id', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .delete(`/tasks/${task.id}`)
      .set(...auth(token1))

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.status).toBe(404)
  })

  it('makes the task invisible to GET /tasks/open', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .delete(`/tasks/${task.id}`)
      .set(...auth(token1))

    const listRes = await request(app)
      .get('/tasks/open')
      .set(...auth(token1))

    expect(listRes.body).toEqual([])
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .delete('/tasks/nonexistent-id')
      .set(...auth(token1))

    expect(res.status).toBe(404)
  })

  it('returns 404 when the task belongs to a different user', async () => {
    const task = createTask('user-1', 'Private task')
    await insertTask(task)

    const res = await request(app)
      .delete(`/tasks/${task.id}`)
      .set(...auth(token2))

    expect(res.status).toBe(404)
  })

  it('removes the deleted task from other tasks\' blockers', async () => {
    const blocker = createTask('user-1', 'Blocking task')
    const task = createTask('user-1', 'Blocked task')
    await insertTask(blocker)
    await insertTask(task)

    // Add blocker via API
    await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token1))
      .send({ id: blocker.id })

    // Delete the blocker task
    await request(app)
      .delete(`/tasks/${blocker.id}`)
      .set(...auth(token1))

    // The blocked task should have no blockers left
    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.body.blockers).toHaveLength(0)
  })

  it('only removes the deleted blocker, leaving others intact', async () => {
    const blocker1 = createTask('user-1', 'Blocker one')
    const blocker2 = createTask('user-1', 'Blocker two')
    const task = createTask('user-1', 'Blocked task')
    await insertTask(blocker1)
    await insertTask(blocker2)
    await insertTask(task)

    // Add both blockers
    await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token1))
      .send({ id: blocker1.id })
    await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token1))
      .send({ id: blocker2.id })

    // Delete only blocker1
    await request(app)
      .delete(`/tasks/${blocker1.id}`)
      .set(...auth(token1))

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.body.blockers).toHaveLength(1)
    expect(getRes.body.blockers[0].id).toBe(blocker2.id)
  })
})

describe('PATCH /tasks/:id', () => {
  it('updates title only', async () => {
    const task = createTask('user-1', 'Buy milk', { details: 'whole milk' })
    await insertTask(task)

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(...auth(token1))
      .send({ title: 'Buy oat milk' })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Buy oat milk')
    expect(res.body.details).toBe('whole milk')
  })

  it('updates details only', async () => {
    const task = createTask('user-1', 'Buy milk', { details: 'whole milk' })
    await insertTask(task)

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(...auth(token1))
      .send({ details: '2% milk' })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Buy milk')
    expect(res.body.details).toBe('2% milk')
  })

  it('updates both title and details', async () => {
    const task = createTask('user-1', 'Buy milk', { details: 'whole milk' })
    await insertTask(task)

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(...auth(token1))
      .send({ title: 'Buy oat milk', details: 'from Trader Joe\'s' })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Buy oat milk')
    expect(res.body.details).toBe('from Trader Joe\'s')
  })

  it('persists updates to the database', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .patch(`/tasks/${task.id}`)
      .set(...auth(token1))
      .send({ title: 'Buy eggs' })

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.body.title).toBe('Buy eggs')
  })

  it('returns 404 for non-existent task', async () => {
    const res = await request(app)
      .patch('/tasks/nonexistent')
      .set(...auth(token1))
      .send({ title: 'Updated' })

    expect(res.status).toBe(404)
  })

  it('returns 404 for another user\'s task', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(...auth(token2))
      .send({ title: 'Stolen' })

    expect(res.status).toBe(404)
  })

  it('rejects non-string title', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(...auth(token1))
      .send({ title: 123 })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('title must be a string')
  })

  it('rejects non-string details', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(...auth(token1))
      .send({ details: true })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('details must be a string')
  })

  it('allows setting title to empty string', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set(...auth(token1))
      .send({ title: '' })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('')
  })
})

describe('POST /tasks/:id/complete', () => {
  it('completes a task and returns it', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/complete`)
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(task.id)
    expect(res.body.completedAt).not.toBeNull()
  })

  it('persists the completion', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .post(`/tasks/${task.id}/complete`)
      .set(...auth(token1))

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.body.completedAt).not.toBeNull()
  })

  it('removes the task from GET /tasks/open', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .post(`/tasks/${task.id}/complete`)
      .set(...auth(token1))

    const listRes = await request(app)
      .get('/tasks/open')
      .set(...auth(token1))

    expect(listRes.body).toEqual([])
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/complete')
      .set(...auth(token1))

    expect(res.status).toBe(404)
  })

  it('returns 404 when the task belongs to a different user', async () => {
    const task = createTask('user-1', 'Private task')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/complete`)
      .set(...auth(token2))

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
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeNull()
  })

  it('returns the task to GET /tasks/open', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)
    await updateTask(task, completeTask(task, new Date()))

    await request(app)
      .post(`/tasks/${task.id}/reopen`)
      .set(...auth(token1))

    const listRes = await request(app)
      .get('/tasks/open')
      .set(...auth(token1))

    expect(listRes.body).toHaveLength(1)
    expect(listRes.body[0].title).toBe('Buy milk')
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/reopen')
      .set(...auth(token1))

    expect(res.status).toBe(404)
  })
})

describe('POST /tasks/:id/snooze', () => {
  it('snoozes a task until the given date', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/snooze`)
      .set(...auth(token1))
      .send({ until: '2026-04-01T12:00:00Z' })

    expect(res.status).toBe(200)
    expect(res.body.snoozedUntil).toBe('2026-04-01T12:00:00.000Z')
  })

  it('persists the snooze', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .post(`/tasks/${task.id}/snooze`)
      .set(...auth(token1))
      .send({ until: '2026-04-01T12:00:00Z' })

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.body.snoozedUntil).toBe('2026-04-01T12:00:00.000Z')
  })

  it('returns 400 when until is missing', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/snooze`)
      .set(...auth(token1))
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/until is required/)
  })

  it('returns 400 for an invalid date', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/snooze`)
      .set(...auth(token1))
      .send({ until: 'not-a-date' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/valid ISO 8601/)
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/snooze')
      .set(...auth(token1))
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
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body.snoozedUntil).toBeNull()
  })

  it('persists the wake', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)
    await updateTask(task, snoozeTask(task, new Date('2026-04-01T12:00:00Z')))

    await request(app)
      .post(`/tasks/${task.id}/wake`)
      .set(...auth(token1))

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.body.snoozedUntil).toBeNull()
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/wake')
      .set(...auth(token1))

    expect(res.status).toBe(404)
  })
})

describe('GET /tasks/open/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app)
      .get('/tasks/open/search')
      .set(...auth(token1))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/q query parameter is required/)
  })

  it('returns 400 when q is empty', async () => {
    const res = await request(app)
      .get('/tasks/open/search?q=')
      .set(...auth(token1))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/q query parameter is required/)
  })

  it('returns 400 when q is only whitespace', async () => {
    const res = await request(app)
      .get('/tasks/open/search?q=%20%20')
      .set(...auth(token1))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/q query parameter is required/)
  })

  it('returns matching tasks', async () => {
    await insertTask(createTask('user-1', 'Buy groceries', { details: 'milk and eggs' }))
    await insertTask(createTask('user-1', 'Fix the roof'))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Buy groceries')
  })

  it('returns an empty array when nothing matches', async () => {
    await insertTask(createTask('user-1', 'Buy groceries'))

    const res = await request(app)
      .get('/tasks/open/search?q=unicorn')
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('does not return tasks belonging to other users', async () => {
    await insertTask(createTask('user-1', 'Buy groceries'))
    await insertTask(createTask('user-2', 'Buy groceries'))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set(...auth(token1))

    expect(res.body).toHaveLength(1)
  })

  it('does not return deleted tasks', async () => {
    const task = createTask('user-1', 'Buy groceries')
    await insertTask(task)
    await softDeleteTask(task, deleteTask(task, new Date()))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set(...auth(token1))

    expect(res.body).toEqual([])
  })

  it('does not return completed tasks', async () => {
    const task = createTask('user-1', 'Buy groceries')
    await insertTask(task)
    await updateTask(task, completeTask(task, new Date()))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set(...auth(token1))

    expect(res.body).toEqual([])
  })

  it('does not include userId or deletedAt in the response', async () => {
    await insertTask(createTask('user-1', 'Buy groceries'))

    const res = await request(app)
      .get('/tasks/open/search?q=groceries')
      .set(...auth(token1))

    expect(res.body[0]).not.toHaveProperty('userId')
    expect(res.body[0]).not.toHaveProperty('deletedAt')
  })

  it('matches on details text', async () => {
    await insertTask(createTask('user-1', 'Shopping', { details: 'need bananas' }))

    const res = await request(app)
      .get('/tasks/open/search?q=bananas')
      .set(...auth(token1))

    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Shopping')
  })
})

describe('GET /tasks/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = await request(app)
      .get('/tasks/search')
      .set(...auth(token1))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/q query parameter is required/)
  })

  it('returns 400 when q is empty', async () => {
    const res = await request(app)
      .get('/tasks/search?q=')
      .set(...auth(token1))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/q query parameter is required/)
  })

  it('returns 400 when q is only whitespace', async () => {
    const res = await request(app)
      .get('/tasks/search?q=%20%20')
      .set(...auth(token1))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/q query parameter is required/)
  })

  it('returns matching tasks', async () => {
    await insertTask(createTask('user-1', 'Buy groceries', { details: 'milk and eggs' }))
    await insertTask(createTask('user-1', 'Fix the roof'))

    const res = await request(app)
      .get('/tasks/search?q=groceries')
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Buy groceries')
  })

  it('returns completed tasks', async () => {
    const task = createTask('user-1', 'Buy groceries')
    await insertTask(task)
    await updateTask(task, completeTask(task, new Date()))

    const res = await request(app)
      .get('/tasks/search?q=groceries')
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].completedAt).not.toBeNull()
  })

  it('returns archived tasks', async () => {
    const task = createTask('user-1', 'Buy groceries')
    await insertTask(task)
    await updateTask(task, archiveTask(task, new Date()))

    const res = await request(app)
      .get('/tasks/search?q=groceries')
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].archivedAt).not.toBeNull()
  })

  it('does not return deleted tasks', async () => {
    const task = createTask('user-1', 'Buy groceries')
    await insertTask(task)
    await softDeleteTask(task, deleteTask(task, new Date()))

    const res = await request(app)
      .get('/tasks/search?q=groceries')
      .set(...auth(token1))

    expect(res.body).toEqual([])
  })

  it('returns an empty array when nothing matches', async () => {
    await insertTask(createTask('user-1', 'Buy groceries'))

    const res = await request(app)
      .get('/tasks/search?q=unicorn')
      .set(...auth(token1))

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('does not return tasks belonging to other users', async () => {
    await insertTask(createTask('user-1', 'Buy groceries'))
    await insertTask(createTask('user-2', 'Buy groceries'))

    const res = await request(app)
      .get('/tasks/search?q=groceries')
      .set(...auth(token1))

    expect(res.body).toHaveLength(1)
  })

  it('does not include userId or deletedAt in the response', async () => {
    await insertTask(createTask('user-1', 'Buy groceries'))

    const res = await request(app)
      .get('/tasks/search?q=groceries')
      .set(...auth(token1))

    expect(res.body[0]).not.toHaveProperty('userId')
    expect(res.body[0]).not.toHaveProperty('deletedAt')
  })

  it('matches on details text', async () => {
    await insertTask(createTask('user-1', 'Shopping', { details: 'need bananas' }))

    const res = await request(app)
      .get('/tasks/search?q=bananas')
      .set(...auth(token1))

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
      .set(...auth(token1))
      .send({ queue: 'backlog' })

    expect(res.status).toBe(200)
    expect(res.body.queue).toBe('backlog')
  })

  it('moves a task back to todo', async () => {
    const task = createTask('user-1', 'Buy milk', { queue: 'backlog' })
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/queue`)
      .set(...auth(token1))
      .send({ queue: 'todo' })

    expect(res.status).toBe(200)
    expect(res.body.queue).toBe('todo')
  })

  it('persists the queue change', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    await request(app)
      .post(`/tasks/${task.id}/queue`)
      .set(...auth(token1))
      .send({ queue: 'backlog' })

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.body.queue).toBe('backlog')
  })

  it('returns 400 for invalid queue value', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/queue`)
      .set(...auth(token1))
      .send({ queue: 'urgent' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('queue must be "todo" or "backlog"')
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/queue')
      .set(...auth(token1))
      .send({ queue: 'backlog' })

    expect(res.status).toBe(404)
  })
})

describe('POST /tasks/:id/blockers', () => {
  it('adds a blocker by looking up the blocker task', async () => {
    const task = createTask('user-1', 'Buy milk')
    const blocker = createTask('user-1', 'Get wallet')
    await insertTask(task)
    await insertTask(blocker)

    const res = await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token1))
      .send({ id: blocker.id })

    expect(res.status).toBe(200)
    expect(res.body.blockers).toHaveLength(1)
    expect(res.body.blockers[0].id).toBe(blocker.id)
    expect(res.body.blockers[0].title).toBe('Get wallet')
  })

  it('uses the current title from the blocker task', async () => {
    const task = createTask('user-1', 'Buy milk')
    const blocker = createTask('user-1', 'Original title')
    await insertTask(task)
    await insertTask(blocker)

    const res = await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token1))
      .send({ id: blocker.id })

    expect(res.body.blockers[0].title).toBe('Original title')
  })

  it('deduplicates a blocker already on the task', async () => {
    const task = createTask('user-1', 'Buy milk')
    const blocker = createTask('user-1', 'Get wallet')
    await insertTask(task)
    await insertTask(blocker)

    // Add once via domain, persist
    const withBlocker = addBlockers(task, [{ id: blocker.id, title: blocker.title }])
    await updateTask(task, withBlocker)

    // Try to add the same blocker via API
    const res = await request(app)
      .post(`/tasks/${withBlocker.id}/blockers`)
      .set(...auth(token1))
      .send({ id: blocker.id })

    expect(res.status).toBe(200)
    expect(res.body.blockers).toHaveLength(1)
  })

  it('persists the blocker', async () => {
    const task = createTask('user-1', 'Buy milk')
    const blocker = createTask('user-1', 'Get wallet')
    await insertTask(task)
    await insertTask(blocker)

    await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token1))
      .send({ id: blocker.id })

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.body.blockers).toHaveLength(1)
    expect(getRes.body.blockers[0].id).toBe(blocker.id)
  })

  it('returns 400 when id is missing', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token1))
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/id is required/)
  })

  it('returns 404 when the blocker task does not exist', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token1))
      .send({ id: 'nonexistent-id' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Blocker task not found')
  })

  it('returns 404 when the blocker belongs to a different user', async () => {
    const task = createTask('user-1', 'Buy milk')
    const otherUserTask = createTask('user-2', 'Their task')
    await insertTask(task)
    await insertTask(otherUserTask)

    const res = await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token1))
      .send({ id: otherUserTask.id })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Blocker task not found')
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/blockers')
      .set(...auth(token1))
      .send({ id: 'some-id' })

    expect(res.status).toBe(404)
  })

  it('returns 404 when the task belongs to a different user', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/blockers`)
      .set(...auth(token2))
      .send({ id: 'some-id' })

    expect(res.status).toBe(404)
  })
})

describe('POST /tasks/:id/blockers/remove', () => {
  it('removes a blocker from a task', async () => {
    const task = createTask('user-1', 'Buy milk')
    const blocker = createTask('user-1', 'Get wallet')
    await insertTask(task)
    await insertTask(blocker)

    const withBlocker = addBlockers(task, [{ id: blocker.id, title: blocker.title }])
    await updateTask(task, withBlocker)

    const res = await request(app)
      .post(`/tasks/${task.id}/blockers/remove`)
      .set(...auth(token1))
      .send({ id: blocker.id })

    expect(res.status).toBe(200)
    expect(res.body.blockers).toHaveLength(0)
  })

  it('ignores an id that is not in the blockers list', async () => {
    const task = createTask('user-1', 'Buy milk')
    const blocker = createTask('user-1', 'Get wallet')
    await insertTask(task)
    const withBlocker = addBlockers(task, [{ id: blocker.id, title: blocker.title }])
    await updateTask(task, withBlocker)

    const res = await request(app)
      .post(`/tasks/${task.id}/blockers/remove`)
      .set(...auth(token1))
      .send({ id: 'nonexistent-id' })

    expect(res.status).toBe(200)
    expect(res.body.blockers).toHaveLength(1)
  })

  it('persists the removal', async () => {
    const task = createTask('user-1', 'Buy milk')
    const blocker = createTask('user-1', 'Get wallet')
    await insertTask(task)
    const withBlocker = addBlockers(task, [{ id: blocker.id, title: blocker.title }])
    await updateTask(task, withBlocker)

    await request(app)
      .post(`/tasks/${task.id}/blockers/remove`)
      .set(...auth(token1))
      .send({ id: blocker.id })

    const getRes = await request(app)
      .get(`/tasks/${task.id}`)
      .set(...auth(token1))

    expect(getRes.body.blockers).toHaveLength(0)
  })

  it('returns 400 when id is missing', async () => {
    const task = createTask('user-1', 'Buy milk')
    await insertTask(task)

    const res = await request(app)
      .post(`/tasks/${task.id}/blockers/remove`)
      .set(...auth(token1))
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/id is required/)
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/blockers/remove')
      .set(...auth(token1))
      .send({ id: 'b1' })

    expect(res.status).toBe(404)
  })
})

describe('POST /tasks sortOrder', () => {
  it('includes sortOrder in the response', async () => {
    const res = await request(app)
      .post('/tasks')
      .set(...auth(token1))
      .send({ title: 'First task' })

    expect(res.body.sortOrder).toBeDefined()
    expect(typeof res.body.sortOrder).toBe('string')
  })

  it('assigns increasing sortOrder to successive tasks', async () => {
    const res1 = await request(app)
      .post('/tasks')
      .set(...auth(token1))
      .send({ title: 'First' })

    const res2 = await request(app)
      .post('/tasks')
      .set(...auth(token1))
      .send({ title: 'Second' })

    const res3 = await request(app)
      .post('/tasks')
      .set(...auth(token1))
      .send({ title: 'Third' })

    expect(res1.body.sortOrder < res2.body.sortOrder).toBe(true)
    expect(res2.body.sortOrder < res3.body.sortOrder).toBe(true)
  })

  it('returns tasks sorted by sortOrder', async () => {
    await request(app).post('/tasks').set(...auth(token1)).send({ title: 'First' })
    await request(app).post('/tasks').set(...auth(token1)).send({ title: 'Second' })
    await request(app).post('/tasks').set(...auth(token1)).send({ title: 'Third' })

    const res = await request(app)
      .get('/tasks/active')
      .set(...auth(token1))

    expect(res.body.map((t: { title: string }) => t.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('places a task at the top when position is "top"', async () => {
    await request(app).post('/tasks').set(...auth(token1)).send({ title: 'First' })
    await request(app).post('/tasks').set(...auth(token1)).send({ title: 'Second' })

    await request(app).post('/tasks').set(...auth(token1))
      .send({ title: 'Top task', position: 'top' })

    const list = await request(app).get('/tasks/active').set(...auth(token1))
    expect(list.body.map((t: { title: string }) => t.title)).toEqual(['Top task', 'First', 'Second'])
  })

  it('returns 400 for invalid position', async () => {
    const res = await request(app).post('/tasks').set(...auth(token1))
      .send({ title: 'Bad', position: 'middle' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('position must be "top" or "bottom"')
  })

  it('assigns sortOrder independently per user', async () => {
    const r1 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'User1 task' })
    const r2 = await request(app).post('/tasks').set(...auth(token2)).send({ title: 'User2 task' })

    // Both users' first task should get the same sortOrder (both start from empty)
    expect(r1.body.sortOrder).toBe(r2.body.sortOrder)
  })
})

describe('POST /tasks/:id/reorder', () => {
  it('moves a task between two others', async () => {
    const r1 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'A' })
    const r2 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'B' })
    const r3 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'C' })

    // Move C between A and B
    const res = await request(app)
      .post(`/tasks/${r3.body.id}/reorder`)
      .set(...auth(token1))
      .send({ afterId: r1.body.id, beforeId: r2.body.id })

    expect(res.status).toBe(200)
    expect(res.body.sortOrder > r1.body.sortOrder).toBe(true)
    expect(res.body.sortOrder < r2.body.sortOrder).toBe(true)

    // Verify list order is now A, C, B
    const list = await request(app).get('/tasks/active').set(...auth(token1))
    expect(list.body.map((t: { title: string }) => t.title)).toEqual(['A', 'C', 'B'])
  })

  it('moves a task to the top (afterId null)', async () => {
    const r1 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'A' })
    await request(app).post('/tasks').set(...auth(token1)).send({ title: 'B' })
    const r3 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'C' })

    // Move C to the top
    const res = await request(app)
      .post(`/tasks/${r3.body.id}/reorder`)
      .set(...auth(token1))
      .send({ afterId: null, beforeId: r1.body.id })

    expect(res.status).toBe(200)
    expect(res.body.sortOrder < r1.body.sortOrder).toBe(true)

    const list = await request(app).get('/tasks/active').set(...auth(token1))
    expect(list.body.map((t: { title: string }) => t.title)).toEqual(['C', 'A', 'B'])
  })

  it('moves a task to the bottom (beforeId null)', async () => {
    const r1 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'A' })
    await request(app).post('/tasks').set(...auth(token1)).send({ title: 'B' })
    const r3 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'C' })

    // Move A to the bottom
    const res = await request(app)
      .post(`/tasks/${r1.body.id}/reorder`)
      .set(...auth(token1))
      .send({ afterId: r3.body.id, beforeId: null })

    expect(res.status).toBe(200)
    expect(res.body.sortOrder > r3.body.sortOrder).toBe(true)

    const list = await request(app).get('/tasks/active').set(...auth(token1))
    expect(list.body.map((t: { title: string }) => t.title)).toEqual(['B', 'C', 'A'])
  })

  it('preserves sortOrder when changing queue', async () => {
    const r1 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'A' })

    const queueRes = await request(app)
      .post(`/tasks/${r1.body.id}/queue`)
      .set(...auth(token1))
      .send({ queue: 'backlog' })

    expect(queueRes.body.sortOrder).toBe(r1.body.sortOrder)
  })

  it('returns 404 when the task does not exist', async () => {
    const res = await request(app)
      .post('/tasks/nonexistent-id/reorder')
      .set(...auth(token1))
      .send({ afterId: null, beforeId: null })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Task not found')
  })

  it('returns 404 when afterId task does not exist', async () => {
    const r1 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'A' })

    const res = await request(app)
      .post(`/tasks/${r1.body.id}/reorder`)
      .set(...auth(token1))
      .send({ afterId: 'nonexistent', beforeId: null })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('afterId task not found')
  })

  it('returns 404 when beforeId task does not exist', async () => {
    const r1 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'A' })

    const res = await request(app)
      .post(`/tasks/${r1.body.id}/reorder`)
      .set(...auth(token1))
      .send({ afterId: null, beforeId: 'nonexistent' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('beforeId task not found')
  })

  it('returns 400 when afterId sorts after beforeId', async () => {
    const r1 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'A' })
    const r2 = await request(app).post('/tasks').set(...auth(token1)).send({ title: 'B' })

    // Pass them in wrong order: afterId has higher sortOrder than beforeId
    const res = await request(app)
      .post(`/tasks/${r1.body.id}/reorder`)
      .set(...auth(token1))
      .send({ afterId: r2.body.id, beforeId: r1.body.id })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('afterId must sort before beforeId')
  })

  it('does not allow reordering another user\'s task', async () => {
    const r1 = await request(app).post('/tasks').set(...auth(token2)).send({ title: 'Their task' })

    const res = await request(app)
      .post(`/tasks/${r1.body.id}/reorder`)
      .set(...auth(token1))
      .send({ afterId: null, beforeId: null })

    expect(res.status).toBe(404)
  })
})
