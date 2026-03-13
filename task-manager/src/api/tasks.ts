import { Router } from 'express'
import type { Task } from '../domain/task.js'
import { createTask } from '../domain/task.js'
import type { Queue } from '../domain/task.js'
import { deleteTask } from '../domain/task_operations.js'
import { findOpenTasks, findTaskById, insertTask, updateTask } from '../repository/task_repository.js'

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
