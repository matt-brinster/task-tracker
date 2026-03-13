import { describe, it, expect } from 'vitest'
import { createTask } from './task.js'
import { completeTask, reopenTask, snoozeTask, wakeTask, deleteTask, addBlockerIds, removeBlockerIds } from './task_operations.js'

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
    const task = createTask('user-1', 'Buy milk', 'from the shop', 'backlog', new Set(['id-1']))
    const now = new Date('2026-03-10T12:00:00Z')
    const result = completeTask(task, now)
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
    expect(result.blockerIds).toEqual(task.blockerIds)
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
    const task = createTask('user-1', 'Buy milk', 'from the shop', 'backlog', new Set(['id-1']))
    const completed = completeTask(task, new Date())
    const result = reopenTask(completed)
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
    expect(result.blockerIds).toEqual(task.blockerIds)
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
    const task = createTask('user-1', 'Buy milk', 'from the shop', 'backlog', new Set(['id-1']))
    const result = snoozeTask(task, new Date('2026-03-15T09:00:00Z'))
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.completedAt).toBe(task.completedAt)
    expect(result.blockerIds).toEqual(task.blockerIds)
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
    const task = createTask('user-1', 'Buy milk', 'from the shop', 'backlog', new Set(['id-1']))
    const now = new Date('2026-03-10T12:00:00Z')
    const result = deleteTask(task, now)
    expect(result.id).toBe(task.id)
    expect(result.queue).toBe(task.queue)
    expect(result.completedAt).toBe(task.completedAt)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
    expect(result.blockerIds).toEqual(task.blockerIds)
  })
})

describe('addBlockerIds', () => {
  it('adds blocker IDs to an empty set', () => {
    const task = createTask('user-1', 'Buy bread')
    const result = addBlockerIds(task, new Set(['abc123']))
    expect(result.blockerIds).toEqual(new Set(['abc123']))
  })

  it('merges with existing blocker IDs', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', new Set(['existing']))
    const result = addBlockerIds(task, new Set(['new1', 'new2']))
    expect(result.blockerIds).toEqual(new Set(['existing', 'new1', 'new2']))
  })

  it('deduplicates IDs already present', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', new Set(['abc123']))
    const result = addBlockerIds(task, new Set(['abc123']))
    expect(result.blockerIds).toEqual(new Set(['abc123']))
  })

  it('is a no-op with an empty set', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', new Set(['abc123']))
    const result = addBlockerIds(task, new Set())
    expect(result.blockerIds).toEqual(new Set(['abc123']))
  })

  it('does not mutate the original task', () => {
    const task = createTask('user-1', 'Buy bread')
    addBlockerIds(task, new Set(['abc123']))
    expect(task.blockerIds).toEqual(new Set())
  })

  it('preserves all other fields', () => {
    const task = createTask('user-1', 'Buy bread', 'from the bakery', 'backlog')
    const result = addBlockerIds(task, new Set(['abc123']))
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.completedAt).toBe(task.completedAt)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
  })
})

describe('removeBlockerIds', () => {
  it('removes a blocker ID', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', new Set(['abc123']))
    const result = removeBlockerIds(task, new Set(['abc123']))
    expect(result.blockerIds).toEqual(new Set())
  })

  it('removes only the specified IDs, leaving others', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', new Set(['a', 'b', 'c']))
    const result = removeBlockerIds(task, new Set(['a', 'c']))
    expect(result.blockerIds).toEqual(new Set(['b']))
  })

  it('is a no-op when the ID is not present', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', new Set(['abc123']))
    const result = removeBlockerIds(task, new Set(['unknown']))
    expect(result.blockerIds).toEqual(new Set(['abc123']))
  })

  it('is a no-op with an empty set', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', new Set(['abc123']))
    const result = removeBlockerIds(task, new Set())
    expect(result.blockerIds).toEqual(new Set(['abc123']))
  })

  it('does not mutate the original task', () => {
    const task = createTask('user-1', 'Buy bread', '', 'todo', new Set(['abc123']))
    removeBlockerIds(task, new Set(['abc123']))
    expect(task.blockerIds).toEqual(new Set(['abc123']))
  })

  it('preserves all other fields', () => {
    const task = createTask('user-1', 'Buy bread', 'from the bakery', 'backlog', new Set(['abc123']))
    const result = removeBlockerIds(task, new Set(['abc123']))
    expect(result.id).toBe(task.id)
    expect(result.title).toBe(task.title)
    expect(result.details).toBe(task.details)
    expect(result.queue).toBe(task.queue)
    expect(result.completedAt).toBe(task.completedAt)
    expect(result.snoozedUntil).toBe(task.snoozedUntil)
  })
})
