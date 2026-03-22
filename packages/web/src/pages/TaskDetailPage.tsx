import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTask, completeTask, reopenTask, deleteTask, createTask } from '../api.ts'

type Props = {
  taskId: string | null  // null = new task
  onBack: () => void
}

export default function TaskDetailPage({ taskId, onBack }: Props) {
  if (taskId) {
    return <ExistingTaskDetail taskId={taskId} onBack={onBack} />
  }
  return <NewTaskDetail onBack={onBack} />
}

function ExistingTaskDetail({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const queryClient = useQueryClient()

  const { data: task, isLoading, error } = useQuery({
    queryKey: ['tasks', taskId],
    queryFn: () => fetchTask(taskId),
  })

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'open'] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: reopenTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'open'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'open'] })
      onBack()
    },
  })

  function handleCheckbox() {
    if (!task) return
    if (task.completedAt) {
      reopenMutation.mutate(taskId)
    } else {
      completeMutation.mutate(taskId)
    }
  }

  function handleDelete() {
    deleteMutation.mutate(taskId)
  }

  if (isLoading) {
    return (
      <DetailShell onBack={onBack}>
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <p>Loading...</p>
        </div>
      </DetailShell>
    )
  }

  if (error || !task) {
    return (
      <DetailShell onBack={onBack}>
        <div className="flex-1 flex items-center justify-center text-red-500 px-4">
          <p>Failed to load task.</p>
        </div>
      </DetailShell>
    )
  }

  const isCompleted = !!task.completedAt
  const displayTitle = task.title || '(unnamed)'

  return (
    <DetailShell onBack={onBack} onDelete={handleDelete}>
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={handleCheckbox}
            aria-label={isCompleted ? `Reopen "${displayTitle}"` : `Complete "${displayTitle}"`}
          >
            {/* TODO: this is repeated style */}
            <span className={`inline-block w-5 h-5 border-2 rounded ${
              isCompleted ? 'bg-green-500 border-green-500' : 'border-gray-300'
            }`}>
              {isCompleted && (
                <svg className="w-full h-full text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </span>
          </button>
          <span className={`text-lg text-gray-900`}>
            {displayTitle}
          </span>
        </div>
      </div>

      <div className="px-4 py-3">
        <textarea
          readOnly
          value={task.details}
          placeholder="No details"
          className="w-full h-32 border border-gray-200 rounded p-2 text-sm text-gray-700 bg-gray-50 resize-none"
        />
      </div>
    </DetailShell>
  )
}

// TODO: we can combine a lot between ExistingTaskDetail and NewTaskDetail when we implement auto update
function NewTaskDetail({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')

  const createMutation = useMutation({
    mutationFn: () => createTask(title.trim(), details),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'open'] })
      onBack()
    },
  })

  function handleSave() {
    if (title.trim() === '') return
    createMutation.mutate()
  }

  return (
    <DetailShell onBack={onBack}>
      <div className="px-4 py-3 border-b border-gray-200">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Task name"
          autoFocus
          className="w-full text-lg text-gray-900 border-none outline-none placeholder-gray-400"
        />
      </div>

      <div className="px-4 py-3">
        <textarea
          value={details}
          onChange={e => setDetails(e.target.value)}
          placeholder="Details (optional)"
          className="w-full h-32 border border-gray-200 rounded p-2 text-sm text-gray-700 resize-none"
        />
      </div>

      <div className="px-4">
        {createMutation.error && (
          <p className="text-red-600 text-sm mb-2">Failed to create task.</p>
        )}
        <button
          onClick={handleSave}
          disabled={title.trim() === '' || createMutation.isPending}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating...' : 'Create Task'}
        </button>
      </div>
    </DetailShell>
  )
}

function DetailShell({ onBack, onDelete, children }: {
  onBack: () => void
  onDelete?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <button
          onClick={onBack}
          className="text-gray-600 hover:text-gray-900"
          aria-label="Back"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center bg-red-100 text-red-600 rounded hover:bg-red-200"
            aria-label="Delete task"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </header>
      {children}
    </div>
  )
}
