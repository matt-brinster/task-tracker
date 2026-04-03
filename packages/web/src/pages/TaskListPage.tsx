import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchActiveTasks, archiveTasks, reorderTask } from '../api.ts'
import { useTaskMutations, invalidateTaskQueries } from '../hooks/useTaskMutations.ts'
import type { TaskResponse } from '../types.ts'
import CheckboxRow from '../components/CheckboxRow.tsx'
import SectionDivider from '../components/SectionDivider.tsx'
import Loading from '../components/Loading.tsx'
import ErrorMessage from '../components/ErrorMessage.tsx'
import { useSortable, isSortable } from '@dnd-kit/react/sortable'
import { useState } from 'react'
import { DragDropProvider } from '@dnd-kit/react'

type Props = {
  onSettings: () => void
  onTaskClick: (taskId: string) => void
  onNewTask: () => void
  onNewBacklog: () => void
  onSearch: () => void
}

export default function TaskListPage({ onSettings, onTaskClick, onNewTask, onNewBacklog, onSearch }: Props) {
  const queryClient = useQueryClient()
  const { completeMutation, reopenMutation } = useTaskMutations()

  const { data: tasks, isLoading, error } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const result = await fetchActiveTasks()
      // Seed individual task caches so BlockerRow doesn't need to fetch active tasks
      for (const task of result) {
        queryClient.setQueryData(['task', task.id], task)
      }
      return result
    },
  })

  const archiveMutation = useMutation({
    mutationFn: archiveTasks,
    onSuccess: () => {
      invalidateTaskQueries(queryClient)
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
      invalidateTaskQueries(queryClient)
    },
  })

  const openTaskIds = new Set((tasks ?? []).filter(t => !t.completedAt).map(t => t.id))

  const todoTasks = (tasks ?? [])
    .filter(t => t.queue === 'todo' && (t.completedAt !== null || !isBlockedByOpenTask(t, openTaskIds)) && !isSnoozed(t))
    .sort((a, b) => a.sortOrder < b.sortOrder ? -1 : 1)

  const blockedTasks = (tasks ?? [])
    .filter(t => isBlockedByOpenTask(t, openTaskIds) && !t.completedAt && !isSnoozed(t))
    .sort((a, b) => a.sortOrder < b.sortOrder ? -1 : 1)

  const backlogTasks = (tasks ?? [])
    .filter(t => t.queue === 'backlog' && (t.completedAt !== null || !isBlockedByOpenTask(t, openTaskIds)) && !isSnoozed(t))
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
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <button
          onClick={onSearch}
          className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded"
          aria-label="Search"
        >
          <SearchIcon />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={handleArchiveCompleted}
            disabled={archiveMutation.isPending || completedTasks.length === 0}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 disabled:text-gray-300 rounded"
            aria-label="Archive completed tasks"
          >
            <ArchiveIcon />
          </button>
          <button
            onClick={onSettings}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded"
            aria-label="Settings"
          >
            <GearIcon />
          </button>
        </div>
      </header>

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
          {blockedTasks.length > 0 && (
            <div className="mt-4">
              <SectionDivider label="Blocked" />
              <ul>
                {blockedTasks.map(task => (
                  <li key={task.id} className="flex items-start">
                    <CheckboxRow
                      title={task.title}
                      completedAt={task.completedAt}
                      onCheck={() => handleCheckbox(task)}
                      onClick={() => onTaskClick(task.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
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
      <CheckboxRow
        title={task.title}
        completedAt={task.completedAt}
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


function SearchIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
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

function isBlockedByOpenTask(task: TaskResponse, openTaskIds: Set<string>): boolean {
  return task.blockers.some(b => openTaskIds.has(b.id))
}
