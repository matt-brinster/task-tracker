import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchActiveTasks, completeTask, reopenTask, archiveTasks } from '../api.ts'
import type { TaskResponse } from '../types.ts'
import { clearToken } from '../auth.ts'

type Props = {
  onLogout: () => void
  onTaskClick: (taskId: string) => void
  onNewTask: () => void
}

export default function TaskListPage({ onLogout, onTaskClick, onNewTask }: Props) {
  const queryClient = useQueryClient()

  const { data: tasks, isLoading, error } = useQuery({
    queryKey: ['tasks', 'active'],
    queryFn: fetchActiveTasks,
  })

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: reopenTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: archiveTasks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  function handleCheckbox(task: TaskResponse) {
    if (task.completedAt) {
      reopenMutation.mutate(task.id)
    } else {
      completeMutation.mutate(task.id)
    }
  }

  function handleArchiveCompleted() {
    const completedIds = completedTasks.map(t => t.id)
    if (completedIds.length > 0) {
      archiveMutation.mutate(completedIds)
    }
  }

  function handleLogout() {
    clearToken()
    onLogout()
  }

  const visibleTasks = tasks?.filter(t =>
    t.queue === 'todo' &&
    !isBlockedByOpenTask(t) &&
    !isSnoozed(t)
  ) ?? []

  const completedTasks = tasks?.filter(t => t.completedAt !== null) ?? []

  return (
    <div className="flex-1 flex flex-col">
      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <p>Loading...</p>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center text-red-500 px-4">
          <p>Failed to load tasks.</p>
        </div>
      )}

      {!isLoading && !error && (
        <div className="flex-1 overflow-y-auto">
          <ul>
            {visibleTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                onCheck={() => handleCheckbox(task)}
                onClick={() => onTaskClick(task.id)}
              />
            ))}
          </ul>

          <button
            onClick={onNewTask}
            className="w-full py-3 text-center text-gray-500 hover:text-gray-700"
          >
            + Task
          </button>

          <div className="border-t border-gray-200 mt-4">
            <p className="text-center text-xs text-gray-400 uppercase tracking-wider py-3">Settings</p>
            <button
              onClick={handleArchiveCompleted}
              disabled={archiveMutation.isPending || completedTasks.length === 0}
              className="w-full py-3 text-center text-gray-500 hover:text-gray-700 disabled:text-gray-300"
            >
              {archiveMutation.isPending ? 'Archiving...' : 'Archive completed tasks'}
            </button>
            <button
              onClick={handleLogout}
              className="w-full py-3 text-center text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onCheck, onClick }: {
  task: TaskResponse
  onCheck: () => void
  onClick: () => void
}) {
  const completed = task.completedAt !== null
  const displayTitle = task.title || '(unnamed)'

  return (
    <li className="flex items-center border-b border-gray-100">
      <button
        onClick={onCheck}
        className="px-4 py-3 flex-shrink-0"
        aria-label={completed ? `Reopen "${displayTitle}"` : `Complete "${displayTitle}"`}
      >
        <span className={`inline-block w-5 h-5 border-2 rounded ${
          completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
        }`}>
          {completed && (
            <svg className="w-full h-full text-white" viewBox="0 0 20 20" fill="currentColor">
              {/* TODO: shop for icon */}
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </span>
      </button>
      <button
        onClick={onClick}
        className="flex-1 text-left py-3 pr-4 min-w-0"
      >
        <span className={`block truncate text-gray-900`}>
          {displayTitle}
        </span>
      </button>
    </li>
  )
}

function isSnoozed(task: TaskResponse): boolean {
  if (!task.snoozedUntil) return false
  return new Date(task.snoozedUntil) > new Date()
}

function isBlockedByOpenTask(task: TaskResponse): boolean {
  // For now, any blocker with no completedAt means the task is blocked.
  // We don't have blocker completion data in the open tasks response,
  // so we treat any task with blockers as blocked.
  return task.blockers.length > 0
}
