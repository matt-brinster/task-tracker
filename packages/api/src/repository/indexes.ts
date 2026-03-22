import { db } from './client.js'

export async function ensureIndexes(): Promise<void> {
  const tasks = db().collection('tasks')
  const users = db().collection('users')

  await tasks.createIndex(
    { userId: 1, deletedAt: 1, completedAt: 1 },
    { name: 'tasks_userId_deletedAt_completedAt' }
  )

  await tasks.createIndex(
    { userId: 1, deletedAt: 1, archivedAt: 1 },
    { name: 'tasks_userId_deletedAt_archivedAt' }
  )

  await users.createIndex(
    { email: 1 },
    { name: 'users_email', unique: true }
  )

  await tasks.createIndex(
    { userId: 1, 'blockers.id': 1 },
    { name: 'tasks_userId_blockersId', sparse: true }
  )

  await tasks.createIndex(
    { userId: 1, title: 'text', details: 'text' },
    { name: 'tasks_text', weights: { title: 2, details: 1 } }
  )

  const invitations = db().collection('invitations')
  const sessions = db().collection('sessions')

  await invitations.createIndex(
    { tokenHash: 1 },
    { name: 'invitations_tokenHash', unique: true }
  )

  await sessions.createIndex(
    { tokenHash: 1 },
    { name: 'sessions_tokenHash', unique: true }
  )
}
