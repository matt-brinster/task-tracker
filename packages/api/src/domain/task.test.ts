import { describe, it, expect } from 'vitest'
import { createTask } from './task.js'

describe('createTask', () => {
  it('creates a task with the given title', () => {
    const task = createTask('user-1', 'Buy milk')
    expect(task.title).toBe('Buy milk')
  })

  it('defaults to empty details', () => {
    const task = createTask('user-1', 'Buy milk')
    expect(task.details).toBe('')
  })

  it('defaults to todo queue', () => {
    const task = createTask('user-1', 'Buy milk')
    expect(task.queue).toBe('todo')
  })

  it('defaults to no blockers', () => {
    const task = createTask('user-1', 'Buy milk')
    expect(task.blockers).toEqual([])
  })

  it('completedAt is null on creation', () => {
    const task = createTask('user-1', 'Buy milk')
    expect(task.completedAt).toBeNull()
  })

  it('snoozedUntil is null on creation', () => {
    const task = createTask('user-1', 'Buy milk')
    expect(task.snoozedUntil).toBeNull()
  })

  it('stores the userId', () => {
    const task = createTask('user-1', 'Buy milk')
    expect(task.userId).toBe('user-1')
  })

  it('accepts a backlog queue', () => {
    const task = createTask('user-1', 'Buy milk', { queue: 'backlog' })
    expect(task.queue).toBe('backlog')
  })

  it('accepts blockers', () => {
    const blockers = [{ id: 'id-1', title: 'Task 1' }, { id: 'id-2', title: 'Task 2' }]
    const task = createTask('user-1', 'Buy milk', { blockers })
    expect(task.blockers).toEqual(blockers)
  })

  it('accepts a snoozedUntil date', () => {
    const date = new Date('2026-04-01')
    const task = createTask('user-1', 'Buy milk', { snoozedUntil: date })
    expect(task.snoozedUntil).toEqual(date)
  })

  it('generates a unique id for each task', () => {
    const a = createTask('user-1', 'Task A')
    const b = createTask('user-1', 'Task B')
    expect(a.id).not.toBe(b.id)
  })

  it('trims whitespace from title', () => {
    const task = createTask('user-1', '  Buy milk  ')
    expect(task.title).toBe('Buy milk')
  })

  it('defaults sortOrder to "a0"', () => {
    const task = createTask('user-1', 'Buy milk')
    expect(task.sortOrder).toBe('a0')
  })

  it('accepts a custom sortOrder', () => {
    const task = createTask('user-1', 'Buy milk', { sortOrder: 'a5' })
    expect(task.sortOrder).toBe('a5')
  })
})
