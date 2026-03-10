import { describe, it, expect } from 'vitest'
import { createTask } from './task.js'

describe('createTask', () => {
  it('creates a task with the given title', () => {
    const task = createTask('Buy milk')
    expect(task.title).toBe('Buy milk')
  })

  it('defaults to empty details', () => {
    const task = createTask('Buy milk')
    expect(task.details).toBe('')
  })

  it('defaults to todo queue', () => {
    const task = createTask('Buy milk')
    expect(task.queue).toBe('todo')
  })

  it('defaults to no blockers', () => {
    const task = createTask('Buy milk')
    expect(task.blockerIds).toEqual([])
  })

  it('completedAt is null on creation', () => {
    const task = createTask('Buy milk')
    expect(task.completedAt).toBeNull()
  })

  it('snoozedUntil is null on creation', () => {
    const task = createTask('Buy milk')
    expect(task.snoozedUntil).toBeNull()
  })

  it('accepts a backlog queue', () => {
    const task = createTask('Buy milk', '', 'backlog')
    expect(task.queue).toBe('backlog')
  })

  it('accepts blocker IDs', () => {
    const task = createTask('Buy milk', '', 'todo', ['id-1', 'id-2'])
    expect(task.blockerIds).toEqual(['id-1', 'id-2'])
  })

  it('accepts a snoozedUntil date', () => {
    const date = new Date('2026-04-01')
    const task = createTask('Buy milk', '', 'todo', [], date)
    expect(task.snoozedUntil).toEqual(date)
  })

  it('generates a unique id for each task', () => {
    const a = createTask('Task A')
    const b = createTask('Task B')
    expect(a.id).not.toBe(b.id)
  })

  it('trims whitespace from title', () => {
    const task = createTask('  Buy milk  ')
    expect(task.title).toBe('Buy milk')
  })
})
