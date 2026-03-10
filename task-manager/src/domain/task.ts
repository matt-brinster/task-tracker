import { randomUUID } from 'crypto'

export type Queue = 'todo' | 'backlog'

export type Task = {
  id: string
  title: string
  details: string
  queue: Queue
  completedAt: Date | null
  snoozedUntil: Date | null
  blockerIds: string[]  // IDs of tasks that the user says will block this task
}

export function createTask(title: string, details: string = "", queue: Queue = 'todo', blockerIds: string[] = [], snoozedUntil: Date | null = null): Task {
  return {
    id: randomUUID(),
    title: title.trim(),
    details,
    queue,
    completedAt: null,
    snoozedUntil,
    blockerIds,
  }
}
