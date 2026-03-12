import { v7 as uuidv7 } from 'uuid'

export type Queue = 'todo' | 'backlog'

export type Task = {
  id: string
  userId: string
  title: string
  details: string
  queue: Queue
  completedAt: Date | null
  snoozedUntil: Date | null
  blockerIds: Set<string>  // IDs of tasks that the user says will block this task
}

export function createTask(userId: string, title: string, details: string = "", queue: Queue = 'todo', blockerIds: Set<string> | null = null, snoozedUntil: Date | null = null): Task {
  return {
    id: uuidv7(),
    userId,
    title: title.trim(),
    details,
    queue,
    completedAt: null,
    snoozedUntil,
    blockerIds: blockerIds ?? new Set()
  }
}
