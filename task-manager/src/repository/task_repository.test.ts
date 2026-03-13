import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { client } from './client.js'
import { db } from './client.js'
import { createTask } from '../domain/task.js'
import { completeTask, deleteTask, snoozeTask } from '../domain/task_operations.js'
import { insertTask, updateTask, findTaskById, findOpenTasks, fromDocument } from './task_repository.js'
import type { TaskDocument } from './task_repository.js'

describe('task repository', () => {
  beforeAll(async () => {
    await client.connect()
  })

  afterEach(async () => {
    await db().collection('tasks').deleteMany({})
  })

  afterAll(async () => {
    await client.close()
  })

  describe('insertTask', () => {
    it('inserts a task and stores it as a document', async () => {
      const task = createTask('user-1', 'Buy milk')
      await insertTask(task)

      const doc = await db().collection<TaskDocument>('tasks').findOne({ _id: task.id })
      expect(doc).not.toBeNull()
      expect(doc!._id).toBe(task.id)
      expect(doc!.userId).toBe('user-1')
      expect(doc!.title).toBe('Buy milk')
      expect(doc!.details).toBe('')
      expect(doc!.queue).toBe('todo')
      expect(doc!.completedAt).toBeNull()
      expect(doc!.snoozedUntil).toBeNull()
      expect(doc!.blockers).toEqual([])
    })

    it('stores blockers as an array of objects', async () => {
      const blockers = [{ id: 'blocker-1', title: 'Task A' }, { id: 'blocker-2', title: 'Task B' }]
      const task = createTask('user-1', 'Deploy', '', 'todo', blockers)
      await insertTask(task)

      const doc = await db().collection<TaskDocument>('tasks').findOne({ _id: task.id })
      expect(doc!.blockers).toEqual(blockers)
      expect(doc!.blockers).toHaveLength(2)
    })

    it('stores snoozedUntil as a Date', async () => {
      const snoozeDate = new Date('2026-04-01T12:00:00Z')
      const task = createTask('user-1', 'Later', '', 'todo', [], snoozeDate)
      await insertTask(task)

      const doc = await db().collection<TaskDocument>('tasks').findOne({ _id: task.id })
      expect(doc!.snoozedUntil).toEqual(snoozeDate)
    })

    it('rejects duplicate task ids', async () => {
      const task = createTask('user-1', 'Original')
      await insertTask(task)

      await expect(insertTask(task)).rejects.toThrow()
    })
  })

  describe('updateTask', () => {
    it('replaces the document with the updated task', async () => {
      const task = createTask('user-1', 'Buy milk')
      await insertTask(task)

      const completed = completeTask(task, new Date('2026-03-10T12:00:00Z'))
      await updateTask(task, completed)

      const doc = await db().collection<TaskDocument>('tasks').findOne({ _id: task.id })
      expect(doc!.completedAt).toEqual(new Date('2026-03-10T12:00:00Z'))
      expect(doc!.title).toBe('Buy milk')
    })

    it('persists a soft delete with PII scrubbed', async () => {
      const task = createTask('user-1', 'Secret task', 'sensitive details')
      await insertTask(task)

      const deleted = deleteTask(task, new Date('2026-03-10T12:00:00Z'))
      await updateTask(task, deleted)

      const doc = await db().collection<TaskDocument>('tasks').findOne({ _id: task.id })
      expect(doc!.deletedAt).toEqual(new Date('2026-03-10T12:00:00Z'))
      expect(doc!.title).toBe('')
      expect(doc!.details).toBe('')
    })

    it('is a no-op when the task does not exist', async () => {
      const task = createTask('user-1', 'Ghost')
      const completed = completeTask(task, new Date())

      await updateTask(task, completed)

      const doc = await db().collection<TaskDocument>('tasks').findOne({ _id: task.id })
      expect(doc).toBeNull()
    })
  })

  describe('findTaskById', () => {
    it('returns a task by userId and id', async () => {
      const task = createTask('user-1', 'Buy milk')
      await insertTask(task)

      const found = await findTaskById('user-1', task.id)
      expect(found).toEqual(task)
    })

    it('returns null when the task does not exist', async () => {
      const found = await findTaskById('user-1', 'nonexistent-id')
      expect(found).toBeNull()
    })

    it('returns null when the task belongs to a different user', async () => {
      const task = createTask('user-1', 'Private task')
      await insertTask(task)

      const found = await findTaskById('user-2', task.id)
      expect(found).toBeNull()
    })

    it('returns null for soft-deleted tasks', async () => {
      const task = createTask('user-1', 'Doomed task')
      await insertTask(task)

      const deleted = deleteTask(task, new Date('2026-03-10T12:00:00Z'))
      await updateTask(task, deleted)

      const found = await findTaskById('user-1', task.id)
      expect(found).toBeNull()
    })
  })

  describe('findOpenTasks', () => {
    it('returns incomplete, non-deleted tasks for a user', async () => {
      const task1 = createTask('user-1', 'Task one')
      const task2 = createTask('user-1', 'Task two')
      await insertTask(task1)
      await insertTask(task2)

      const tasks = await findOpenTasks('user-1')
      expect(tasks).toHaveLength(2)
      expect(tasks.map(t => t.title)).toContain('Task one')
      expect(tasks.map(t => t.title)).toContain('Task two')
    })

    it('excludes completed tasks', async () => {
      const task = createTask('user-1', 'Done task')
      await insertTask(task)
      const completed = completeTask(task, new Date('2026-03-10T12:00:00Z'))
      await updateTask(task, completed)

      const tasks = await findOpenTasks('user-1')
      expect(tasks).toHaveLength(0)
    })

    it('excludes soft-deleted tasks', async () => {
      const task = createTask('user-1', 'Deleted task')
      await insertTask(task)
      const deleted = deleteTask(task, new Date('2026-03-10T12:00:00Z'))
      await updateTask(task, deleted)

      const tasks = await findOpenTasks('user-1')
      expect(tasks).toHaveLength(0)
    })

    it('excludes tasks belonging to other users', async () => {
      const task = createTask('user-1', 'My task')
      const otherTask = createTask('user-2', 'Their task')
      await insertTask(task)
      await insertTask(otherTask)

      const tasks = await findOpenTasks('user-1')
      expect(tasks).toHaveLength(1)
      expect(tasks[0]!.title).toBe('My task')
    })

    it('includes snoozed tasks', async () => {
      const task = createTask('user-1', 'Snoozed task')
      await insertTask(task)
      const snoozed = snoozeTask(task, new Date('2026-04-01T12:00:00Z'))
      await updateTask(task, snoozed)

      const tasks = await findOpenTasks('user-1')
      expect(tasks).toHaveLength(1)
      expect(tasks[0]!.snoozedUntil).toEqual(new Date('2026-04-01T12:00:00Z'))
    })

    it('returns an empty array when the user has no tasks', async () => {
      const tasks = await findOpenTasks('user-1')
      expect(tasks).toEqual([])
    })
  })

  describe('fromDocument', () => {
    it('round-trips a task through document conversion', async () => {
      const task = createTask('user-1', 'Round trip', 'some details', 'backlog', [{ id: 'b1', title: 'Blocker' }])
      await insertTask(task)

      const doc = await db().collection<TaskDocument>('tasks').findOne({ _id: task.id })
      const restored = fromDocument(doc!)

      expect(restored).toEqual(task)
    })
  })
})
