import { describe, it, expect } from 'vitest'
import { createTask } from './task.js'
import { completeTask, reopenTask, snoozeTask, wakeTask, deleteTask, addBlockers, removeBlockers } from './task_operations.js'

const blocker1 = { id: 'id-1', title: 'Blocker 1' }
const blocker2 = { id: 'id-2', title: 'Blocker 2' }
const blocker3 = { id: 'id-3', title: 'Blocker 3' }

describe('completeTask', () => {
  it('sets completedAt to the provided date', () => {
    const task = createTask('user-1', 'Buy milk')
    const now = new Date('2026-03-10T12:00:00Z')
    const result = completeTask(task, now)
    expect(result.completedAt).toEqual(now)
  })

  it('does not mutate the original task', () => {
    const task = createTask('user-1', 'Buy milk')
    completeTask(task, new Date())
    expect(task.completedAt).toBeNull()
  })

  it('preserves all other fields', () => {
    const task = createTask('user-1', 'Buy milk', 'from the shop', 'backlog', [blocker1])
    const now = new Date('2026-03-10T12:00:00Z')
    const result = completeTask(task, now)
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
    expect(result.blockers).toEqual(task.blockers)
  })

  it('can complete an already-completed task (updates the timestamp)', () => {
    const task = createTask('user-1', 'Buy milk')
    const first = new Date('2026-03-10T12:00:00Z')
    const second = new Date('2026-03-11T09:00:00Z')
    const result = completeTask(completeTask(task, first), second)
    expect(result.completedAt).toEqual(second)
  })
})

describe('reopenTask', () => {
  it('clears completedAt', () => {
    const task = completeTask(createTask('user-1', 'Buy milk'), new Date())
    const result = reopenTask(task)
    expect(result.completedAt).toBeNull()
  })

  it('does not mutate the original task', () => {
    const completed = completeTask(createTask('user-1', 'Buy milk'), new Date())
    reopenTask(completed)
    expect(completed.completedAt).not.toBeNull()
  })

  it('preserves all other fields', () => {
    const task = createTask('user-1', 'Buy milk', 'from the shop', 'backlog', [blocker1])
    const completed = completeTask(task, new Date())
    const result = reopenTask(completed)
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
    expect(result.blockers).toEqual(task.blockers)
  })

  it('is a no-op on a task that is not completed', () => {
    const task = createTask('user-1', 'Buy milk')
    const result = reopenTask(task)
    expect(result.completedAt).toBeNull()
  })
})

describe('snoozeTask', () => {
  it('sets snoozedUntil to the provided date', () => {
    const task = createTask('user-1', 'Buy milk')
    const until = new Date('2026-03-15T09:00:00Z')
    const result = snoozeTask(task, until)
    expect(result.snoozedUntil).toEqual(until)
  })

  it('does not mutate the original task', () => {
    const task = createTask('user-1', 'Buy milk')
    snoozeTask(task, new Date())
    expect(task.snoozedUntil).toBeNull()
  })

  it('preserves all other fields', () => {
    const task = createTask('user-1', 'Buy milk', 'from the shop', 'backlog', [blocker1])
    const result = snoozeTask(task, new Date('2026-03-15T09:00:00Z'))
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.completedAt).toBe(task.completedAt)
    expect(result.blockers).toEqual(task.blockers)
  })

  it('can update the snooze date on an already-snoozed task', () => {
    const task = createTask('user-1', 'Buy milk')
    const first = new Date('2026-03-15T09:00:00Z')
    const second = new Date('2026-03-20T09:00:00Z')
    const result = snoozeTask(snoozeTask(task, first), second)
    expect(result.snoozedUntil).toEqual(second)
  })
})

describe('wakeTask', () => {
  it('clears snoozedUntil', () => {
    const task = snoozeTask(createTask('user-1', 'Buy milk'), new Date('2026-03-15T09:00:00Z'))
    const result = wakeTask(task)
    expect(result.snoozedUntil).toBeNull()
  })

  it('does not mutate the original task', () => {
    const snoozed = snoozeTask(createTask('user-1', 'Buy milk'), new Date('2026-03-15T09:00:00Z'))
    wakeTask(snoozed)
    expect(snoozed.snoozedUntil).not.toBeNull()
  })

  it('is a no-op on a task that is not snoozed', () => {
    const task = createTask('user-1', 'Buy milk')
    const result = wakeTask(task)
    expect(result.snoozedUntil).toBeNull()
  })
})

describe('deleteTask', () => {
  it('sets deletedAt to the provided date', () => {
    const task = createTask('user-1', 'Buy milk')
    const now = new Date('2026-03-10T12:00:00Z')
    const result = deleteTask(task, now)
    expect(result.deletedAt).toEqual(now)
  })

  it('does not mutate the original task', () => {
    const task = createTask('user-1', 'Buy milk')
    deleteTask(task, new Date())
    expect(task.deletedAt).toBeNull()
  })

  it('clears title and details to scrub PII', () => {
    const task = createTask('user-1', 'Buy milk', 'from the shop')
    const result = deleteTask(task, new Date('2026-03-10T12:00:00Z'))
    expect(result.title).toBe('')
    expect(result.details).toBe('')
  })

  it('preserves all other fields', () => {
    const task = createTask('user-1', 'Buy milk', 'from the shop', 'backlog', [blocker1])
    const now = new Date('2026-03-10T12:00:00Z')
    const result = deleteTask(task, now)
    expect(result.id).toBe(task.id)
    expect(result.queue).toBe(task.queue)
    expect(result.completedAt).toBe(task.completedAt)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
    expect(result.blockers).toEqual(task.blockers)
  })
})

describe('addBlockers', () => {
  it('adds blockers to an empty array', () => {
    const task = createTask('user-1', 'Buy bread')
    const result = addBlockers(task, [blocker1])
    expect(result.blockers).toEqual([blocker1])
  })

  it('appends to existing blockers', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', [blocker1])
    const result = addBlockers(task, [blocker2, blocker3])
    expect(result.blockers).toEqual([blocker1, blocker2, blocker3])
  })

  it('deduplicates by id', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', [blocker1])
    const result = addBlockers(task, [blocker1])
    expect(result.blockers).toEqual([blocker1])
  })

  it('is a no-op with an empty array', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', [blocker1])
    const result = addBlockers(task, [])
    expect(result.blockers).toEqual([blocker1])
  })

  it('does not mutate the original task', () => {
    const task = createTask('user-1', 'Buy bread')
    addBlockers(task, [blocker1])
    expect(task.blockers).toEqual([])
  })

  it('preserves all other fields', () => {
    const task = createTask('user-1', 'Buy bread', 'from the bakery', 'backlog')
    const result = addBlockers(task, [blocker1])
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.completedAt).toBe(task.completedAt)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
  })
})

describe('removeBlockers', () => {
  it('removes a blocker by id', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', [blocker1])
    const result = removeBlockers(task, new Set(['id-1']))
    expect(result.blockers).toEqual([])
  })

  it('removes only the specified ids, leaving others', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', [blocker1, blocker2, blocker3])
    const result = removeBlockers(task, new Set(['id-1', 'id-3']))
    expect(result.blockers).toEqual([blocker2])
  })

  it('is a no-op when the id is not present', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', [blocker1])
    const result = removeBlockers(task, new Set(['unknown']))
    expect(result.blockers).toEqual([blocker1])
  })

  it('is a no-op with an empty set', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', [blocker1])
    const result = removeBlockers(task, new Set())
    expect(result.blockers).toEqual([blocker1])
  })

  it('does not mutate the original task', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', [blocker1])
    removeBlockers(task, new Set(['id-1']))
    expect(task.blockers).toEqual([blocker1])
  })

  it('preserves all other fields', () => {
    const task = createTask('user-1', 'Buy bread', 'from the bakery', 'backlog', [blocker1])
    const result = removeBlockers(task, new Set(['id-1']))
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.completedAt).toBe(task.completedAt)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
  })
})
