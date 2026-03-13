import { Router } from 'express'
import type { Task } from '../domain/task.js'
import { findOpenTasks } from '../repository/task_repository.js'

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

taskRouter.get('/', async (req, res) => {
  const tasks = await findOpenTasks(req.userId)
  res.json(tasks.map(toTaskResponse))
})
