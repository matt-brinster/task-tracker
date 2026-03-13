import type { Task } from './task.js'

export function completeTask(task: Task, at: Date): Task {
  return { ...task, completedAt: at }
}

// completeTask/reopenTask are inverses: completeTask sets completedAt, reopenTask clears it.
export function reopenTask(task: Task): Task {
  return { ...task, completedAt: null }
}

// snoozeTask/wakeTask are inverses: snooze sets snoozedUntil, wake clears it.
export function snoozeTask(task: Task, until: Date): Task {
  return { ...task, snoozedUntil: until }
}

export function wakeTask(task: Task): Task {
  return { ...task, snoozedUntil: null }
}

export function deleteTask(task: Task, at: Date): Task {
  return { ...task, title: '', details: '', deletedAt: at }
}

export function addBlockerIds(task: Task, blockerIds: Set<string>): Task {
  return { ...task, blockerIds: new Set([...task.blockerIds, ...blockerIds])};
}

export function removeBlockerIds(task: Task, blockerIds: Set<string>): Task {
  return { ...task, blockerIds: new Set([...task.blockerIds].filter(id => !blockerIds.has(id))) };
}