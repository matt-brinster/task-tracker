export type Queue = 'todo' | 'backlog'

export type Blocker = {
  id: string
  title: string
}

export type TaskResponse = {
  id: string
  title: string
  details: string
  queue: Queue
  completedAt: string | null
  snoozedUntil: string | null
  archivedAt: string | null
  blockers: Blocker[]
}
