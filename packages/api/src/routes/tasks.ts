import { Router } from 'express'
import { generateKeyBetween } from 'fractional-indexing'
import type { Task, Queue, CreateTaskOptions } from '../domain/task.js'
import { createTask } from '../domain/task.js'
import { completeTask, reopenTask, snoozeTask, wakeTask, deleteTask, setQueue, addBlockers, removeBlockers, reorderTask } from '../domain/task_operations.js'
import { findOpenTasks, findActiveTasks, findTaskById, insertTask, updateTask, softDeleteTask, searchOpenTasks, searchAllTasks, archiveTasks, findMaxSortOrder, findMinSortOrder } from '../repository/task_repository.js'

function toTaskResponse(task: Task) {
  return {
    id: task.id,
    title: task.title,
    details: task.details,
    queue: task.queue,
    sortOrder: task.sortOrder,
    completedAt: task.completedAt,
    snoozedUntil: task.snoozedUntil,
    archivedAt: task.archivedAt,
    blockers: task.blockers,
  }
}

export const taskRouter = Router()

taskRouter.get('/open', async (req, res) => {
  const tasks = await findOpenTasks(req.userId)
  res.json(tasks.map(toTaskResponse))
})

taskRouter.get('/active', async (req, res) => {
  const tasks = await findActiveTasks(req.userId)
  res.json(tasks.map(toTaskResponse))
})

taskRouter.post('/archive', async (req, res) => {
  const { taskIds } = req.body
  if (!Array.isArray(taskIds) || taskIds.length === 0 || !taskIds.every(id => typeof id === 'string')) {
    res.status(400).json({ error: 'taskIds must be a non-empty array of strings' })
    return
  }
  const archivedCount = await archiveTasks(req.userId, taskIds, new Date())
  res.json({ archivedCount })
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

  const { position } = req.body
  if (position !== undefined && position !== 'top' && position !== 'bottom') {
    res.status(400).json({ error: 'position must be "top" or "bottom"' })
    return
  }

  let sortOrder: string
  if (position === 'top') {
    const minSortOrder = await findMinSortOrder(req.userId)
    sortOrder = generateKeyBetween(null, minSortOrder)
  } else {
    const maxSortOrder = await findMaxSortOrder(req.userId)
    sortOrder = generateKeyBetween(maxSortOrder, null)
  }
  const options: CreateTaskOptions = { details, sortOrder }
  if (queue !== undefined) options.queue = queue as Queue
  const task = createTask(req.userId, title, options)
  await insertTask(task)
  res.status(201).json(toTaskResponse(task))
})

taskRouter.get('/open/search', async (req, res) => {
  const q = req.query.q
  if (typeof q !== 'string' || q.trim() === '') {
    res.status(400).json({ error: 'q query parameter is required' })
    return
  }
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 100), 100)
  const tasks = await searchOpenTasks(req.userId, q.trim(), limit)
  res.json(tasks.map(toTaskResponse))
})

taskRouter.get('/search', async (req, res) => {
  const q = req.query.q
  if (typeof q !== 'string' || q.trim() === '') {
    res.status(400).json({ error: 'q query parameter is required' })
    return
  }
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 100), 100)
  const tasks = await searchAllTasks(req.userId, q.trim(), limit)
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

taskRouter.patch('/:id', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }

  const { title, details } = req.body
  if (title !== undefined && typeof title !== 'string') {
    res.status(400).json({ error: 'title must be a string' })
    return
  }
  if (details !== undefined && typeof details !== 'string') {
    res.status(400).json({ error: 'details must be a string' })
    return
  }

  const updated: typeof task = {
    ...task,
    ...(title !== undefined ? { title } : {}),
    ...(details !== undefined ? { details } : {}),
  }
  await updateTask(task, updated)
  res.json(toTaskResponse(updated))
})

taskRouter.delete('/:id', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  const deleted = deleteTask(task, new Date())
  await softDeleteTask(task, deleted)
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

taskRouter.post('/:id/reorder', async (req, res) => {
  const task = await findTaskById(req.userId, req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }

  const { afterId, beforeId } = req.body
  if (afterId !== null && afterId !== undefined && typeof afterId !== 'string') {
    res.status(400).json({ error: 'afterId must be a string or null' })
    return
  }
  if (beforeId !== null && beforeId !== undefined && typeof beforeId !== 'string') {
    res.status(400).json({ error: 'beforeId must be a string or null' })
    return
  }

  let afterSortOrder: string | null = null
  let beforeSortOrder: string | null = null

  if (afterId) {
    const afterTask = await findTaskById(req.userId, afterId)
    if (!afterTask) {
      res.status(404).json({ error: 'afterId task not found' })
      return
    }
    afterSortOrder = afterTask.sortOrder
  }

  if (beforeId) {
    const beforeTask = await findTaskById(req.userId, beforeId)
    if (!beforeTask) {
      res.status(404).json({ error: 'beforeId task not found' })
      return
    }
    beforeSortOrder = beforeTask.sortOrder
  }

  let newSortOrder: string
  try {
    newSortOrder = generateKeyBetween(afterSortOrder, beforeSortOrder)
  } catch (err) {
    console.warn(`reorder failed for task ${task.id}: afterSortOrder=${afterSortOrder}, beforeSortOrder=${beforeSortOrder}`, err)
    res.status(400).json({ error: 'afterId must sort before beforeId' })
    return
  }
  const updated = reorderTask(task, newSortOrder)
  await updateTask(task, updated)
  res.json(toTaskResponse(updated))
})
