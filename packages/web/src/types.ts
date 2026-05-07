export type Queue = 'todo' | 'backlog'

export type UserResponse = {
  id: string
  email: string
  isAdmin: boolean
}

export type ProvisionUserResponse = {
  userId: string
  email: string
  invitationKey: string
}

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
  sortOrder: string
}
