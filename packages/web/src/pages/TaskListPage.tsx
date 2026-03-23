import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchActiveTasks, completeTask, reopenTask, archiveTasks } from '../api.ts'
import type { TaskResponse } from '../types.ts'
import { clearToken } from '../auth.ts'
import Checkbox from '../components/Checkbox.tsx'
import SectionDivider from '../components/SectionDivider.tsx'
import Loading from '../components/Loading.tsx'
import ErrorMessage from '../components/ErrorMessage.tsx'

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
      {isLoading && <Loading />}

      {error && <ErrorMessage message="Failed to load tasks." />}

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

          <div className="mt-4">
            <SectionDivider label="Settings" />
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
      <div className="px-4 py-3 shrink-0">
        <Checkbox
          checked={completed}
          onClick={onCheck}
          displayTitle={displayTitle}
        />
      </div>
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
