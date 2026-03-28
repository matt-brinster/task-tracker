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
  sortOrder: string
  completedAt: Date | null
  snoozedUntil: Date | null
  deletedAt: Date | null
  archivedAt: Date | null
  blockers: Blocker[]
}

export type CreateTaskOptions = {
  details?: string
  queue?: Queue
  blockers?: Blocker[]
  snoozedUntil?: Date | null
  sortOrder?: string
}

export function createTask(userId: string, title: string, options: CreateTaskOptions = {}): Task {
  const { details = "", queue = "todo", blockers = [], snoozedUntil = null, sortOrder = "a0" } = options
  return {
    id: uuidv7(),
    userId,
    title: title.trim(),
    details,
    queue,
    sortOrder,
    completedAt: null,
    snoozedUntil,
    deletedAt: null,
    archivedAt: null,
    blockers: [...blockers],
  }
}
