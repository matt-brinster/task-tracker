import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDebouncedCallback } from 'use-debounce'
import { fetchTask, updateTask, deleteTask, createTask, setQueue as setQueueApi } from '../api.ts'
import type { Queue, TaskResponse } from '../types.ts'
import { useTaskMutations } from '../hooks/useTaskMutations.ts'
import BackButton from '../components/BackButton.tsx'
import Checkbox from '../components/Checkbox.tsx'
import Loading from '../components/Loading.tsx'
import ErrorMessage from '../components/ErrorMessage.tsx'

type Props = {
  taskId: string | null  // null = new task
  initialQueue?: Queue
  onBack: () => void
}

export default function TaskDetailPage({ taskId, initialQueue = 'todo', onBack }: Props) {
  if (taskId) {
    return <ExistingTaskLoader taskId={taskId} onBack={onBack} />
  }
  return <TaskForm initialTitle="" initialDetails="" task={null} initialQueue={initialQueue} onBack={onBack} />
}

function ExistingTaskLoader({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const { data: task, isLoading, error } = useQuery({
    queryKey: ['tasks', taskId],
    queryFn: () => fetchTask(taskId),
  })

  if (isLoading) {
    return (
      <DetailShell onBack={onBack}>
        <Loading />
      </DetailShell>
    )
  }

  if (error || !task) {
    return (
      <DetailShell onBack={onBack}>
        <ErrorMessage message="Failed to load task." />
      </DetailShell>
    )
  }

  // key={taskId} ensures the form resets if we navigate between tasks
  return (
    <TaskForm
      key={taskId}
      initialTitle={task.title}
      initialDetails={task.details}
      task={task}
      initialQueue={task.queue}
      onBack={onBack}
    />
  )
}

const DEBOUNCE_MS = 200

type TaskFormProps = {
  initialTitle: string
  initialDetails: string
  task: TaskResponse | null  // null = new task
  initialQueue: Queue
  onBack: () => void
}

function TaskForm({ initialTitle, initialDetails, task, initialQueue, onBack }: TaskFormProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(initialTitle)
  const [details, setDetails] = useState(initialDetails)
  const [queue, setQueue] = useState<Queue>(initialQueue)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Once a new task is created, we promote it to an "existing" task by storing its ID here.
  const [createdId, setCreatedId] = useState<string | null>(null)
  const taskId = task?.id ?? createdId

  const createPendingRef = useRef(false)
  // Track latest values so the create callback can detect drift and follow up with a PATCH
  const titleRef = useRef(title)
  const detailsRef = useRef(details)
  const queueRef = useRef(queue)

  const { completeMutation, reopenMutation } = useTaskMutations()

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onBack()
    },
  })

  const queueMutation = useMutation({
    mutationFn: (newQueue: Queue) => setQueueApi(taskId!, newQueue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  function patchTask(id: string, patchTitle: string, patchDetails: string) {
    return updateTask(id, { title: patchTitle, details: patchDetails })
      .then(() => queryClient.invalidateQueries({ queryKey: ['tasks'] }))
      .catch(() => setSaveError('Failed to save changes.'))
  }

  const debouncedSave = useDebouncedCallback(
    (currentTitle: string, currentDetails: string, currentTaskId: string | null) => {
      setSaveError(null)
      if (currentTaskId) {
        patchTask(currentTaskId, currentTitle, currentDetails)
      } else if (currentTitle.trim() !== '' && !createPendingRef.current) {
        createPendingRef.current = true
        createTask(currentTitle.trim(), currentDetails, queueRef.current)
          .then((created) => {
            createPendingRef.current = false
            setCreatedId(created.id)
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            // If the user kept typing while the create was in flight,
            // the debounce skipped those saves. Catch up with a PATCH now.
            const latestTitle = titleRef.current
            const latestDetails = detailsRef.current
            if (latestTitle !== currentTitle || latestDetails !== currentDetails) {
              patchTask(created.id, latestTitle, latestDetails)
            }
          })
          .catch(() => {
            createPendingRef.current = false
            setSaveError('Failed to save task.')
          })
      }
    },
    DEBOUNCE_MS,
  )

  function handleCheckbox() {
    if (!task || !taskId) return
    if (task.completedAt) {
      reopenMutation.mutate(taskId)
    } else {
      completeMutation.mutate(taskId)
    }
  }

  function handleDelete() {
    if (taskId) {
      deleteMutation.mutate(taskId)
    } else {
      onBack()
    }
  }

  function handleQueueToggle() {
    const newQueue = queue === 'todo' ? 'backlog' : 'todo'
    setQueue(newQueue)
    queueRef.current = newQueue
    if (taskId) {
      queueMutation.mutate(newQueue)
    }
  }

  const isCompleted = !!task?.completedAt
  const displayTitle = title || '(unnamed)'

  return (
    <DetailShell onBack={onBack} onDelete={handleDelete}>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="pt-1.75 shrink-0">
            <Checkbox
              checked={isCompleted}
              onClick={handleCheckbox}
              displayTitle={displayTitle}
              disabled={!taskId}
            />
          </div>
          <input
            type="text"
            value={title}
            onChange={e => { setTitle(e.target.value); titleRef.current = e.target.value; debouncedSave(e.target.value, details, taskId) }}
            placeholder="Task name"
            autoFocus={!task}
            className="flex-1 text-gray-900 placeholder-gray-400 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="px-4">
        <textarea
          value={details}
          onChange={e => { setDetails(e.target.value); detailsRef.current = e.target.value; debouncedSave(title, e.target.value, taskId) }}
          placeholder="Details (optional)"
          className="w-full h-32 border border-gray-200 rounded px-2 py-1 text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
      </div>

      <div className="px-4 py-2 flex justify-center">
        <QueueToggle queue={queue} onToggle={handleQueueToggle} />
      </div>

      {saveError && (
        <div className="px-4">
          <p className="text-red-600 text-sm">{saveError}</p>
        </div>
      )}
    </DetailShell>
  )
}

function QueueToggle({ queue, onToggle }: { queue: Queue; onToggle: () => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Task queue"
      className="inline-flex rounded border border-gray-200 text-sm"
    >
      <button
        type="button"
        role="radio"
        aria-checked={queue === 'todo'}
        onClick={queue === 'todo' ? undefined : onToggle}
        className={`px-3 py-1 rounded-l ${queue === 'todo' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
      >
        Todo
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={queue === 'backlog'}
        onClick={queue === 'backlog' ? undefined : onToggle}
        className={`px-3 py-1 rounded-r ${queue === 'backlog' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
      >
        Backlog
      </button>
    </div>
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
        <BackButton onClick={onBack} />
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
