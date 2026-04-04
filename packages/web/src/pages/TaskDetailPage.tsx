import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDebouncedCallback } from 'use-debounce'
import { fetchTask, updateTask, deleteTask, createTask, setQueue as setQueueApi, addBlocker } from '../api.ts'
import type { Queue, TaskResponse } from '../types.ts'
import { useTaskMutations, invalidateTaskQueries } from '../hooks/useTaskMutations.ts'
import BackButton from '../components/BackButton.tsx'
import SectionDivider from '../components/SectionDivider.tsx'
import ParentBackButton from '../components/ParentBackButton.tsx'
import Checkbox from '../components/Checkbox.tsx'
import BlockersSection from '../components/BlockersSection.tsx'
import type { NewTaskOptions } from '../components/BlockersSection.tsx'
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
  // Ref mirrors createdId so the debounce callback sees the latest value
  // (the argument passed at onChange time may be stale by the time the callback fires)
  const createdIdRef = useRef(createdId)
  // Track latest values so the create callback can detect drift and follow up with a PATCH
  const titleRef = useRef(title)
  const detailsRef = useRef(details)
  const queueRef = useRef(queue)

  const { completeMutation, reopenMutation, snoozeMutation, wakeMutation } = useTaskMutations()

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      invalidateTaskQueries(queryClient)
      onBack()
    },
  })

  const queueMutation = useMutation({
    mutationFn: (newQueue: Queue) => setQueueApi(taskId!, newQueue),
    onSuccess: () => {
      invalidateTaskQueries(queryClient)
    },
  })

  function patchTask(id: string, patchTitle: string, patchDetails: string) {
    return updateTask(id, { title: patchTitle, details: patchDetails })
      .then(() => invalidateTaskQueries(queryClient))
      .catch(() => setSaveError('Failed to save changes.'))
  }

  const debouncedSave = useDebouncedCallback(
    (currentTitle: string, currentDetails: string, currentTaskId: string | null) => {
      setSaveError(null)
      // Prefer the ref — the argument may have been captured before the create resolved
      const resolvedId = currentTaskId ?? createdIdRef.current
      if (resolvedId) {
        patchTask(resolvedId, currentTitle, currentDetails)
      } else if (currentTitle.trim() !== '' && !createPendingRef.current) {
        createPendingRef.current = true
        createTask(currentTitle.trim(), currentDetails, queueRef.current)
          .then(async (created) => {
            createPendingRef.current = false
            createdIdRef.current = created.id
            setCreatedId(created.id)
            invalidateTaskQueries(queryClient)
            if (pendingBlockerFor) {
              try {
                await addBlocker(pendingBlockerFor, created.id)
                invalidateTaskQueries(queryClient)
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

      {task && taskId && (
        <SnoozeSection
          task={task}
          onSnooze={(until) => snoozeMutation.mutate({ id: taskId, until })}
          onWake={() => wakeMutation.mutate(taskId)}
          isPending={snoozeMutation.isPending || wakeMutation.isPending}
        />
      )}

      <SectionDivider label="Backlog" />

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
        To Do
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

function isSnoozed(task: TaskResponse): boolean {
  if (!task.snoozedUntil) return false
  return new Date(task.snoozedUntil) > new Date()
}

function toLocalDatetimeString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

const SNOOZE_PRESETS = [
  { label: '1 Hour', ms: 60 * 60 * 1000 },
  { label: '1 Day', ms: 24 * 60 * 60 * 1000 },
  { label: '1 Week', ms: 7 * 24 * 60 * 60 * 1000 },
] as const

function SnoozeSection({ task, onSnooze, onWake, isPending }: {
  task: TaskResponse
  onSnooze: (until: Date) => void
  onWake: () => void
  isPending: boolean
}) {
  const snoozed = isSnoozed(task)
  const [expanded, setExpanded] = useState(snoozed)
  const [pickerValue, setPickerValue] = useState(
    task.snoozedUntil ? toLocalDatetimeString(new Date(task.snoozedUntil)) : ''
  )

  function handlePreset(ms: number) {
    const until = new Date(Date.now() + ms)
    setPickerValue(toLocalDatetimeString(until))
    setExpanded(true)
    onSnooze(until)
  }

  function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPickerValue(e.target.value)
    const date = new Date(e.target.value)
    if (!isNaN(date.getTime())) onSnooze(date)
  }

  function handleClear() {
    setPickerValue('')
    setExpanded(false)
    onWake()
  }

  // Minimum datetime for the picker: now, rounded up to the next minute
  const minDatetime = toLocalDatetimeString(
    new Date(Math.ceil(Date.now() / 60000) * 60000)
  )

  return (
    <div className="mt-2">
      <SectionDivider label="Snooze" />
      <div className="flex flex-col items-center gap-2 py-2">
        <div className="flex gap-2">
          {SNOOZE_PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset.ms)}
              disabled={isPending}
              className="px-3 py-1 text-sm text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
        {expanded ? (
          <>
            <input
              type="datetime-local"
              min={minDatetime}
              value={pickerValue}
              onChange={handlePickerChange}
              className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
            <button
              onClick={handleClear}
              disabled={isPending}
              className="px-4 py-1 text-sm text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100 disabled:opacity-50"
            >
              Clear Snooze
            </button>
          </>
        ) : (
          <button
            onClick={() => handlePreset(60 * 60 * 1000)}
            disabled={isPending}
            className="px-3 py-1 text-sm text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 disabled:opacity-50"
          >
            Pick date
          </button>
        )}
      </div>
    </div>
  )
}
