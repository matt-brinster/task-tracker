import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDebouncedCallback } from 'use-debounce'
import { searchTasks } from '../api.ts'
import { useTaskMutations } from '../hooks/useTaskMutations.ts'
import type { TaskResponse } from '../types.ts'
import BackButton from '../components/BackButton.tsx'
import Checkbox from '../components/Checkbox.tsx'

type Props = {
  onBack: () => void
  onTaskClick: (taskId: string) => void
}

export default function SearchPage({ onBack, onTaskClick }: Props) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const { completeMutation, reopenMutation } = useTaskMutations()

  const setQueryDebounced = useDebouncedCallback((value: string) => {
    setQuery(value)
  }, 300)

  function handleInput(value: string) {
    setInput(value)
    setQueryDebounced(value.trim())
  }

  const { data: results, isLoading } = useQuery({
    queryKey: ['tasks', 'search', query],
    queryFn: () => searchTasks(query),
    enabled: query.length > 0,
  })

  function handleCheckbox(task: TaskResponse) {
    if (task.completedAt) {
      reopenMutation.mutate(task.id)
    } else {
      completeMutation.mutate(task.id)
    }
  }

  const tasks = query.length > 0 ? (results ?? []) : []

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
        <BackButton onClick={onBack} className="shrink-0" />
        <input
          type="search"
          value={input}
          onChange={e => handleInput(e.target.value)}
          placeholder="Search tasks..."
          autoFocus
          className="flex-1 border border-gray-200 rounded px-2 py-1 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
      </header>

      <div className="flex-1 overflow-y-auto">
        {isLoading && query.length > 0 && (
          <p className="text-center text-gray-400 py-8">Searching...</p>
        )}

        {!isLoading && tasks.length === 0 && query.length > 0 && (
          <p className="text-center text-gray-400 py-8">No results</p>
        )}

        <ul>
          {tasks.map(task => {
            const archived = task.archivedAt !== null
            const completed = task.completedAt !== null
            const displayTitle = task.title || '(unnamed)'
            return (
              <li key={task.id} className="flex items-start">
                <div className="px-4 pt-2.75 shrink-0">
                  <Checkbox
                    checked={completed}
                    onClick={() => handleCheckbox(task)}
                    displayTitle={displayTitle}
                  />
                </div>
                <button
                  onClick={() => onTaskClick(task.id)}
                  className="flex-1 text-left py-2 pr-4 min-w-0"
                >
                  <span className={`block truncate ${archived || completed ? 'text-gray-400' : 'text-gray-900'}`}>
                    {displayTitle}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
