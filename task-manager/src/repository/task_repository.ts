import type { Collection } from 'mongodb'
import type { Task, Queue, Blocker } from '../domain/task.js'

import { db } from './client.js'

/** The shape of a task document in MongoDB. */
export type TaskDocument = {
  _id: string
  userId: string
  title: string
  details: string
  queue: Queue
  completedAt: Date | null
  snoozedUntil: Date | null
  deletedAt: Date | null
  blockers: Blocker[]
}

function toDocument(task: Task): TaskDocument {
  return {
    _id: task.id,
    userId: task.userId,
    title: task.title,
    details: task.details,
    queue: task.queue,
    completedAt: task.completedAt,
    snoozedUntil: task.snoozedUntil,
    deletedAt: task.deletedAt,
    blockers: [...task.blockers],
  }
}

export function fromDocument(doc: TaskDocument): Task {
  return {
    id: doc._id,
    userId: doc.userId,
    title: doc.title,
    details: doc.details,
    queue: doc.queue,
    completedAt: doc.completedAt,
    snoozedUntil: doc.snoozedUntil,
    deletedAt: doc.deletedAt,
    blockers: [...doc.blockers],
  }
}

function collection(): Collection<TaskDocument> {
  return db().collection<TaskDocument>('tasks')
}

export async function insertTask(task: Task): Promise<void> {
  await collection().insertOne(toDocument(task))
}

export async function updateTask(_old: Task, updated: Task): Promise<void> {
  await collection().replaceOne({ _id: updated.id }, toDocument(updated))
}
