import type { Collection } from 'mongodb'
import type { Task, Queue, Blocker } from '../domain/task.js'

import { db } from './client.js'

/** The shape of a task document in MongoDB. */
// TODO: refactor tests, remove export
export type TaskDocument = {
  _id: string
  userId: string
  title: string
  details: string
  queue: Queue
  sortOrder: string | undefined
  completedAt: Date | null
  snoozedUntil: Date | null
  deletedAt: Date | null
  archivedAt: Date | null
  blockers: Blocker[]
}

function toDocument(task: Task): TaskDocument {
  return {
    _id: task.id,
    userId: task.userId,
    title: task.title,
    details: task.details,
    queue: task.queue,
    sortOrder: task.sortOrder,
    completedAt: task.completedAt,
    snoozedUntil: task.snoozedUntil,
    deletedAt: task.deletedAt,
    archivedAt: task.archivedAt,
    blockers: [...task.blockers],
  }
}

// TODO: refactor tests, remove export
export function fromDocument(doc: TaskDocument): Task {
  return {
    id: doc._id,
    userId: doc.userId,
    title: doc.title,
    details: doc.details,
    queue: doc.queue,
    sortOrder: doc.sortOrder ?? "a0",
    completedAt: doc.completedAt,
    snoozedUntil: doc.snoozedUntil,
    deletedAt: doc.deletedAt,
    archivedAt: doc.archivedAt ?? null,
    blockers: [...doc.blockers],
  }
}

function collection(): Collection<TaskDocument> {
  return db().collection<TaskDocument>('tasks')
}

export async function insertTask(task: Task): Promise<void> {
  await collection().insertOne(toDocument(task))
}

export async function updateTask(old: Task, updated: Task): Promise<void> {
  if (updated.deletedAt !== null) {
    throw new Error('updateTask cannot soft-delete a task — use softDeleteTask instead')
  }
  await collection().replaceOne({ _id: updated.id }, toDocument(updated))
  // Inline fan-out: if title changed, propagate to all denormalized blocker references.
  if (updated.title !== old.title) {
    await updateBlockerTitleInAll(updated.userId, updated.id, updated.title)
  }
}

export async function softDeleteTask(old: Task, deleted: Task): Promise<void> {
  await collection().replaceOne({ _id: deleted.id }, toDocument(deleted))
  // Inline fan-out: remove this task from all blocker lists synchronously.
  // Fine at family scale; batch in background if this becomes a bottleneck.
  await removeBlockerFromAll(deleted.userId, deleted.id)
}

export async function findTaskById(userId: string, taskId: string): Promise<Task | null> {
  const doc = await collection().findOne({ _id: taskId, userId, deletedAt: null })
  return doc ? fromDocument(doc) : null
}

export async function findOpenTasks(userId: string, limit = 1000): Promise<Task[]> {
  const docs = await collection()
    .find({ userId, deletedAt: null, completedAt: null })
    .sort({ sortOrder: 1 })
    .limit(limit)
    .toArray()
  return docs.map(fromDocument)
}

export async function findActiveTasks(userId: string, limit = 1000): Promise<Task[]> {
  const docs = await collection()
    .find({ userId, deletedAt: null, archivedAt: null })
    .sort({ sortOrder: 1 })
    .limit(limit)
    .toArray()
  return docs.map(fromDocument)
}

export async function archiveTasks(userId: string, taskIds: string[], at: Date): Promise<number> {
  const result = await collection().updateMany(
    { _id: { $in: taskIds }, userId, deletedAt: null, archivedAt: null },
    { $set: { archivedAt: at } },
  )
  return result.modifiedCount
}

export async function removeBlockerFromAll(userId: string, blockerId: string): Promise<void> {
  await collection().updateMany(
    { userId, deletedAt: null, 'blockers.id': blockerId },
    { $pull: { blockers: { id: blockerId } } },
  )
}

async function updateBlockerTitleInAll(userId: string, blockerId: string, newTitle: string): Promise<void> {
  await collection().updateMany(
    { userId, deletedAt: null, 'blockers.id': blockerId },
    { $set: { 'blockers.$[elem].title': newTitle } },
    { arrayFilters: [{ 'elem.id': blockerId }] },
  )
}

export async function findMaxSortOrder(userId: string): Promise<string | null> {
  const doc = await collection()
    .find({ userId, deletedAt: null })
    .sort({ sortOrder: -1 })
    .limit(1)
    .project({ sortOrder: 1 })
    .next()
  return doc?.sortOrder ?? null
}

export async function findMinSortOrder(userId: string): Promise<string | null> {
  const doc = await collection()
    .find({ userId, deletedAt: null })
    .sort({ sortOrder: 1 })
    .limit(1)
    .project({ sortOrder: 1 })
    .next()
  return doc?.sortOrder ?? null
}

// Replace $text with Atlas Search ($search + fuzzy) if/when migrating to Atlas.
// $text requires whole words; Atlas Search supports prefix/typo-tolerance out of the box.
// Only the find() call and the index definition (indexes.ts) need to change — callers are unaffected.
export async function searchOpenTasks(userId: string, query: string, limit = 100): Promise<Task[]> {
  const docs = await collection()
    .find({ userId, deletedAt: null, completedAt: null, $text: { $search: query } }, { projection: { score: { $meta: 'textScore' } } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .toArray()
  return docs.map(fromDocument)
}

export async function searchAllTasks(userId: string, query: string, limit = 100): Promise<Task[]> {
  const docs = await collection()
    .find({ userId, deletedAt: null, $text: { $search: query } }, { projection: { score: { $meta: 'textScore' } } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .toArray()
  return docs.map(fromDocument)
}
