import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDebouncedCallback } from 'use-debounce'
import { fetchTask, fetchOpenTasks, updateTask, deleteTask, createTask, setQueue as setQueueApi, addBlocker, removeBlocker, searchOpenTasks } from '../api.ts'
import type { Queue, TaskResponse, Blocker } from '../types.ts'
import { useTaskMutations } from '../hooks/useTaskMutations.ts'
import BackButton from '../components/BackButton.tsx'
import ParentBackButton from '../components/ParentBackButton.tsx'
import Checkbox from '../components/Checkbox.tsx'
import CheckboxRow from '../components/CheckboxRow.tsx'
import SectionDivider from '../components/SectionDivider.tsx'
import Loading from '../components/Loading.tsx'
import ErrorMessage from '../components/ErrorMessage.tsx'

const MAX_STACK_DEPTH = 10

type StackEntry = {
  taskId: string | null
  initialQueue?: Queue
  pendingBlockerFor?: string
}

type TaskDetailPageProps = {
  taskId: string | null  // null = new task
  initialQueue?: Queue
  pendingBlockerFor?: string
  onBack: () => void
}

export default function TaskDetailPage({
  taskId,
  initialQueue = 'todo',
  pendingBlockerFor,
  onBack,
}: TaskDetailPageProps) {
  const [current, setCurrent] = useState<StackEntry>({ taskId, initialQueue, pendingBlockerFor })
  const [stack, setStack] = useState<StackEntry[]>([])

  function handleTaskClick(id: string) {
    setStack(prev => [...prev.slice(-MAX_STACK_DEPTH + 1), current])
    setCurrent({ taskId: id })
  }

  function handleNewTask(opts?: NewTaskOptions) {
    setStack(prev => [...prev.slice(-MAX_STACK_DEPTH + 1), current])
    setCurrent({ taskId: null, initialQueue: opts?.queue, pendingBlockerFor: opts?.pendingBlockerFor })
  }

  function handleParentBack() {
    const prev = stack[stack.length - 1]
    if (prev) {
      setStack(s => s.slice(0, -1))
      setCurrent(prev)
    }
  }

  const parentBack = stack.length > 0 ? handleParentBack : undefined

  if (current.taskId) {
    return <ExistingTaskLoader taskId={current.taskId} onBack={onBack} onTaskClick={handleTaskClick} onNewTask={handleNewTask} onParentBack={parentBack} />
  }
  return <TaskForm initialTitle="" initialDetails="" task={null} initialQueue={current.initialQueue ?? 'todo'} onBack={onBack} pendingBlockerFor={current.pendingBlockerFor} onParentBack={parentBack} />
}

type NewTaskOptions = {
  pendingBlockerFor?: string
  queue?: Queue
}

type ExistingTaskLoaderProps = {
  taskId: string
  onBack: () => void
  onTaskClick?: (taskId: string) => void
  onNewTask?: (opts?: NewTaskOptions) => void
  onParentBack?: () => void
}

function ExistingTaskLoader({
  taskId,
  onBack,
  onTaskClick,
  onNewTask,
  onParentBack,
}: ExistingTaskLoaderProps) {
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
      onTaskClick={onTaskClick}
      onNewTask={onNewTask}
      onParentBack={onParentBack}
    />
  )
}

const DEBOUNCE_MS = 200

type TaskFormProps = {
  initialTitle: string
  initialDetails: string
  task: TaskResponse | null  // null = new task
  initialQueue: Queue
  pendingBlockerFor?: string
  onBack: () => void
  onTaskClick?: (taskId: string) => void
  onNewTask?: (opts?: NewTaskOptions) => void
  onParentBack?: () => void
}

function TaskForm({
  initialTitle,
  initialDetails,
  task,
  initialQueue,
  pendingBlockerFor,
  onBack,
  onTaskClick,
  onNewTask,
  onParentBack,
}: TaskFormProps) {
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
          .then(async (created) => {
            createPendingRef.current = false
            setCreatedId(created.id)
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            if (pendingBlockerFor) {
              try {
                await addBlocker(pendingBlockerFor, created.id)
                queryClient.invalidateQueries({ queryKey: ['tasks'] })
              } catch {
                // blocker link failed silently — task was still created
              }
            }
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
    <DetailShell onBack={onBack} onDelete={handleDelete} onParentBack={onParentBack}>
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

      {task && taskId && (
        <BlockersSection taskId={taskId} blockers={task.blockers} queue={queue} onTaskClick={onTaskClick} onNewTask={onNewTask} />
      )}

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

function BlockerRow({ blocker, onRemove, onTaskClick }: { blocker: Blocker; onRemove: () => void; onTaskClick?: (taskId: string) => void }) {
  const queryClient = useQueryClient()
  const { completeMutation, reopenMutation } = useTaskMutations()

  const cachedTasks = queryClient.getQueryData<TaskResponse[]>(['tasks'])
  const blockerTask = cachedTasks?.find(t => t.id === blocker.id)
  // If not in the active cache, the blocker is archived/completed — treat as done
  const completedAt = blockerTask ? blockerTask.completedAt : '1970-01-01T00:00:00.000Z'
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

function BlockersSection({ taskId, blockers, queue, onTaskClick, onNewTask }: { taskId: string; blockers: Blocker[]; queue: Queue; onTaskClick?: (taskId: string) => void; onNewTask?: (opts?: NewTaskOptions) => void }) {
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }) },
  })

  const addMutation = useMutation({
    mutationFn: (blockerId: string) => addBlocker(taskId, blockerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
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
            className="w-full py-3 text-center text-gray-500 hover:text-gray-700"
          >
            + New blocker
          </button>
        </div>
      )}
    </div>
  )
}

function SmallXIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
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

function DetailShell({ onBack, onDelete, onParentBack, children }: {
  onBack: () => void
  onDelete?: () => void
  onParentBack?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-1">
          {onParentBack && <ParentBackButton onClick={onParentBack} />}
          <BackButton onClick={onBack} />
        </div>
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
