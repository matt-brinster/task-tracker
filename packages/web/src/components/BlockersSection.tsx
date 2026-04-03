import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDebouncedCallback } from 'use-debounce'
import { fetchOpenTasks, fetchTask, addBlocker, removeBlocker, searchOpenTasks } from '../api.ts'
import type { Queue, TaskResponse, Blocker } from '../types.ts'
import { useTaskMutations, invalidateTaskQueries } from '../hooks/useTaskMutations.ts'
import BackButton from './BackButton.tsx'
import CheckboxRow from './CheckboxRow.tsx'
import SectionDivider from './SectionDivider.tsx'

export type NewTaskOptions = {
  pendingBlockerFor?: string
  queue?: Queue
}

function SmallXIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function BlockerRow({ blocker, onRemove, onTaskClick }: { blocker: Blocker; onRemove: () => void; onTaskClick?: (taskId: string) => void }) {
  const { completeMutation, reopenMutation } = useTaskMutations()

  const { data: blockerTask } = useQuery({
    queryKey: ['task', blocker.id],
    queryFn: () => fetchTask(blocker.id),
  })

  const completedAt = blockerTask?.completedAt ?? null
  const isCompleted = completedAt !== null

  return (
    <li className="flex items-start">
      <CheckboxRow
        title={blocker.title}
        completedAt={completedAt}
        onCheck={() => isCompleted ? reopenMutation.mutate(blocker.id) : completeMutation.mutate(blocker.id)}
        onClick={() => onTaskClick?.(blocker.id)}
      />
      <button
        onClick={onRemove}
        className="shrink-0 px-4 py-2 text-gray-400 hover:text-red-500"
        aria-label={`Remove blocker "${blocker.title || '(unnamed)'}"`}
      >
        <SmallXIcon />
      </button>
    </li>
  )
}

export default function BlockersSection({ taskId, blockers, queue, onTaskClick, onNewTask }: { taskId: string; blockers: Blocker[]; queue: Queue; onTaskClick?: (taskId: string) => void; onNewTask?: (opts?: NewTaskOptions) => void }) {
  const queryClient = useQueryClient()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TaskResponse[]>([])

  const { data: openTasks } = useQuery({
    queryKey: ['openTasks'],
    queryFn: fetchOpenTasks,
    enabled: searchOpen,
  })

  const debouncedSearch = useDebouncedCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    try {
      setSearchResults(await searchOpenTasks(q, 5))
    } catch {
      setSearchResults([])
    }
  }, 300)

  const removeMutation = useMutation({
    mutationFn: (blockerId: string) => removeBlocker(taskId, blockerId),
    onSuccess: () => { invalidateTaskQueries(queryClient) },
  })

  const addMutation = useMutation({
    mutationFn: (blockerId: string) => addBlocker(taskId, blockerId),
    onSuccess: () => {
      invalidateTaskQueries(queryClient)
      closeSearch()
    },
  })

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const blockerIds = new Set(blockers.map(b => b.id))
  const candidates = searchQuery.trim()
    ? searchResults
    : (openTasks ?? []).slice(0, 5)
  const filteredCandidates = candidates.filter(t => t.id !== taskId && !blockerIds.has(t.id))

  return (
    <div className="pb-2">
      <SectionDivider label="Blockers" />
      <ul className="mt-1">
        {blockers.map(blocker => (
          <BlockerRow
            key={blocker.id}
            blocker={blocker}
            onRemove={() => removeMutation.mutate(blocker.id)}
            onTaskClick={onTaskClick}
          />
        ))}
      </ul>
      {!searchOpen && (
        <div className="flex justify-center mt-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            + Blocker
          </button>
        </div>
      )}
      {searchOpen && (
        <div className="px-4 mt-2">
          <div className="flex items-center gap-2">
            <BackButton onClick={closeSearch} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); debouncedSearch(e.target.value) }}
              placeholder="Search tasks..."
              autoFocus
              className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <ul className="border border-gray-200 rounded mt-1 divide-y divide-gray-100 max-h-40 overflow-y-auto">
            {filteredCandidates.map(result => (
              <li key={result.id}>
                <button
                  onClick={() => addMutation.mutate(result.id)}
                  disabled={addMutation.isPending}
                  className="w-full text-left px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {result.title || '(unnamed)'}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => { closeSearch(); onNewTask?.({ pendingBlockerFor: taskId, queue }) }}
            className="w-full py-3 text-sm text-center text-gray-500 hover:text-gray-700"
          >
            + New blocker
          </button>
        </div>
      )}
    </div>
  )
}
