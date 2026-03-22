import { v7 as uuidv7 } from 'uuid'

export type Queue = 'todo' | 'backlog'

export type Blocker = {
  id: string
  title: string
}

export type Task = {
  id: string
  userId: string
  title: string
  details: string
  queue: Queue
  completedAt: Date | null
  snoozedUntil: Date | null
  deletedAt: Date | null
  archivedAt: Date | null
  blockers: Blocker[]
}

export function createTask(userId: string, title: string, details: string = "", queue: Queue = 'todo', blockers: Blocker[] = [], snoozedUntil: Date | null = null): Task {
  return {
    id: uuidv7(),
    userId,
    title: title.trim(),
    details,
    queue,
    completedAt: null,
    snoozedUntil,
    deletedAt: null,
    archivedAt: null,
    blockers: [...blockers],
  }
}
