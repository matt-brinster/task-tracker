import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchActiveTasks, archiveTasks, reorderTask } from '../api.ts'
import { useTaskMutations } from '../hooks/useTaskMutations.ts'
import type { TaskResponse } from '../types.ts'
import { clearToken } from '../auth.ts'
import Checkbox from '../components/Checkbox.tsx'
import SectionDivider from '../components/SectionDivider.tsx'
import Loading from '../components/Loading.tsx'
import ErrorMessage from '../components/ErrorMessage.tsx'
import { useSortable, isSortable } from '@dnd-kit/react/sortable'
import { useState } from 'react'
import { DragDropProvider } from '@dnd-kit/react'

type Props = {
  onLogout: () => void
  onTaskClick: (taskId: string) => void
  onNewTask: () => void
  onNewBacklog: () => void
  onSearch: () => void
}

export default function TaskListPage({ onLogout, onTaskClick, onNewTask, onNewBacklog, onSearch }: Props) {
  const queryClient = useQueryClient()
  const { completeMutation, reopenMutation } = useTaskMutations()

  const { data: tasks, isLoading, error } = useQuery({
    queryKey: ['tasks'],
    queryFn: fetchActiveTasks,
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

  const reorderMutation = useMutation({
    mutationFn: ({ id, beforeId, afterId }: { id: string, beforeId: string | null, afterId: string | null }) =>
      reorderTask(id, beforeId, afterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  function handleLogout() {
    clearToken()
    onLogout()
  }

  const todoTasks = (tasks ?? [])
    .filter(t => t.queue === 'todo' && !isBlockedByOpenTask(t) && !isSnoozed(t))
    .sort((a, b) => a.sortOrder < b.sortOrder ? -1 : 1)

  const backlogTasks = (tasks ?? [])
    .filter(t => t.queue === 'backlog' && !isBlockedByOpenTask(t) && !isSnoozed(t))
    .sort((a, b) => a.sortOrder < b.sortOrder ? -1 : 1)

  const completedTasks = tasks?.filter(t => t.completedAt !== null) ?? []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // DragEndEvent is not exported from @dnd-kit/react
  function handleOnDragEnd(event: any) {
    const { operation, canceled } = event
    if (canceled) return
    if (!operation.source) return

    if (isSortable(operation.source)) {
      const { initialIndex: fromIndex,
        initialGroup: fromGroupName,
        index: toIndex
      } = operation.source

      if (fromIndex === toIndex) return
      const list = fromGroupName === "todo" ? todoTasks : backlogTasks
      const reordered = [...list]
      const task = list[fromIndex]
      reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, task)
      const beforeId = reordered[toIndex + 1]?.id ?? null
      const afterId = reordered[toIndex - 1]?.id ?? null
      reorderMutation.mutate({ id: task.id, beforeId, afterId })
      return
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {isLoading && <Loading />}

      {error && <ErrorMessage message="Failed to load tasks." />}

      {!isLoading && !error && (
        <div className="flex-1 overflow-y-auto">
          <DragDropProvider
            onDragEnd={handleOnDragEnd}
          >
            <ul key="todo">
              {todoTasks.map((task, index) => (
                <SortableTaskRow
                  key={task.id}
                  id={task.id}
                  index={index}
                  group="todo"
                  task={task}
                  onCheck={() => handleCheckbox(task)}
                  onClick={() => onTaskClick(task.id)}
                  disabled={reorderMutation.isPending} />
              ))}
            </ul>
          </DragDropProvider>
          <button
            onClick={onNewTask}
            className="w-full py-3 text-center text-gray-500 hover:text-gray-700"
          >
            + Task
          </button>
          <div className="mt-4">
            <SectionDivider label="Backlog" />
            <DragDropProvider
              onDragEnd={handleOnDragEnd}
            >
              <ul key="backlog">
                {backlogTasks.map((task, index) => (
                  <SortableTaskRow
                    key={task.id}
                    id={task.id}
                    index={index}
                    group="backlog"
                    task={task}
                    onCheck={() => handleCheckbox(task)}
                    onClick={() => onTaskClick(task.id)}
                    disabled={reorderMutation.isPending} />
                ))}
              </ul>
            </DragDropProvider>
            <button
              onClick={onNewBacklog}
              className="w-full py-3 text-center text-gray-500 hover:text-gray-700"
            >
              + Backlog
            </button>
          </div>
          <div className="mt-4">
            <SectionDivider label="Settings" />
            <button
              onClick={onSearch}
              className="w-full py-3 text-center text-gray-500 hover:text-gray-700"
            >
              Search
            </button>
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

function SortableTaskRow({ id, index, group, task, onCheck, onClick, disabled }: { id: string, index: number, group: string, task: TaskResponse, onCheck: () => void, onClick: () => void, disabled: boolean }) {
  const [element, setElement] = useState<HTMLLIElement | null>(null)
  const { handleRef } = useSortable({ id, index, element, group })

  return (
    <li ref={setElement} className="flex items-start">
      <CheckBoxAndClickableTaskName
        task={task}
        onCheck={onCheck}
        onClick={onClick} />
      <div
        // the grip can't be grabbed if we have a reorder in flight.
        ref={!disabled ? handleRef : undefined}
        className="px-3 py-2 shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 touch-none"
      >
        <GripIcon />
      </div>
    </li>
  )
}

function CheckBoxAndClickableTaskName({ task, onCheck, onClick }: {
  task: TaskResponse
  onCheck: () => void
  onClick: () => void
}) {
  const completed = task.completedAt !== null
  const displayTitle = task.title || '(unnamed)'
  return (
    <>
      <div className="px-4 pt-2.75 shrink-0">
        <Checkbox
          checked={completed}
          onClick={onCheck}
          displayTitle={displayTitle}
        />
      </div>
      <button
        onClick={onClick}
        className="flex-1 text-left py-2 min-w-0 overflow-hidden"
      >
        <span className="block whitespace-nowrap overflow-hidden [mask-image:linear-gradient(to_right,black_94%,transparent)] text-gray-900">
          {displayTitle}
        </span>
      </button>
    </>)
}

function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
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
