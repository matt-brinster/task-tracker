import { Router } from 'express'
import type { Task } from '../domain/task.js'
import { createTask } from '../domain/task.js'
import type { Queue } from '../domain/task.js'
import { completeTask, reopenTask, snoozeTask, wakeTask, deleteTask, setQueue, addBlockers, removeBlockers } from '../domain/task_operations.js'
import { findOpenTasks, findTaskById, insertTask, updateTask, searchTasks } from '../repository/task_repository.js'

function toTaskResponse(task: Task) {
  return {
    id: task.id,
    title: task.title,
    details: task.details,
    queue: task.queue,
    completedAt: task.completedAt,
    snoozedUntil: task.snoozedUntil,
    blockers: task.blockers,
  }
}

export const taskRouter = Router()

taskRouter.get('/open', async (req, res) => {
  const tasks = await findOpenTasks(req.userId)
  res.json(tasks.map(toTaskResponse))
})

taskRouter.post('/', async (req, res) => {
  const { title, details, queue } = req.body

  if (typeof title !== 'string' || title.trim() === '') {
    res.status(400).json({ error: 'title is required' })
    return
  }

  if (details !== undefined && typeof details !== 'string') {
    res.status(400).json({ error: 'details must be a string' })
    return
  }

  if (queue !== undefined && queue !== 'todo' && queue !== 'backlog') {
    res.status(400).json({ error: 'queue must be "todo" or "backlog"' })
    return
  }

  const task = createTask(req.userId, title, details, queue as Queue | undefined)
  await insertTask(task)
  res.status(201).json(toTaskResponse(task))
})

taskRouter.get('/open/search', async (req, res) => {
  const q = req.query.q
  if (typeof q !== 'string' || q.trim() === '') {
    res.status(400).json({ error: 'q query parameter is required' })
    return
  }
  const tasks = await searchTasks(req.userId, q.trim())
  res.json(tasks.map(toTaskResponse))
})

taskRouter.get('/:id', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  res.json(toTaskResponse(task))
})

taskRouter.delete('/:id', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  const deleted = deleteTask(task, new Date())
  await updateTask(task, deleted)
  res.status(204).end()
})

taskRouter.post('/:id/complete', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  const completed = completeTask(task, new Date())
  await updateTask(task, completed)
  res.json(toTaskResponse(completed))
})

taskRouter.post('/:id/reopen', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  const reopened = reopenTask(task)
  await updateTask(task, reopened)
  res.json(toTaskResponse(reopened))
})

taskRouter.post('/:id/snooze', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }

  const { until } = req.body
  if (typeof until !== 'string') {
    res.status(400).json({ error: 'until is required (ISO 8601 date string)' })
    return
  }
  const date = new Date(until)
  if (isNaN(date.getTime())) {
    res.status(400).json({ error: 'until must be a valid ISO 8601 date string' })
    return
  }

  const snoozed = snoozeTask(task, date)
  await updateTask(task, snoozed)
  res.json(toTaskResponse(snoozed))
})

taskRouter.post('/:id/wake', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  const woken = wakeTask(task)
  await updateTask(task, woken)
  res.json(toTaskResponse(woken))
})

taskRouter.post('/:id/queue', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }

  const { queue } = req.body
  if (queue !== 'todo' && queue !== 'backlog') {
    res.status(400).json({ error: 'queue must be "todo" or "backlog"' })
    return
  }

  const updated = setQueue(task, queue)
  await updateTask(task, updated)
  res.json(toTaskResponse(updated))
})

taskRouter.post('/:id/blockers', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }

  const { id } = req.body
  if (typeof id !== 'string' || id.trim() === '') {
    res.status(400).json({ error: 'id is required' })
    return
  }

  const blockerTask = await findTaskById(req.userId, id)
  if (!blockerTask) {
    res.status(404).json({ error: 'Blocker task not found' })
    return
  }

  const updated = addBlockers(task, [blockerTask])
  await updateTask(task, updated)
  res.json(toTaskResponse(updated))
})

taskRouter.post('/:id/blockers/remove', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }

  const { id } = req.body
  if (typeof id !== 'string' || id.trim() === '') {
    res.status(400).json({ error: 'id is required' })
    return
  }

  const updated = removeBlockers(task, new Set([id]))
  await updateTask(task, updated)
  res.json(toTaskResponse(updated))
})
