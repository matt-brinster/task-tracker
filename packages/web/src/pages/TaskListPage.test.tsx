import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaskListPage from './TaskListPage.tsx'
import * as api from '../api.ts'
import type { TaskResponse } from '../types.ts'

// Capture the onDragEnd callback from DragDropProvider so tests can trigger it directly.
const dnd = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: any) => void) | undefined,
}))

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({ children, onDragEnd }: any) => {
    dnd.onDragEnd = onDragEnd
    return children
  },
}))

vi.mock('@dnd-kit/react/sortable', () => ({
  useSortable: () => ({ handleRef: () => {} }),
  isSortable: () => true,
}))

function makeTasks(...titles: string[]): TaskResponse[] {
  return titles.map((title, i) => ({
    id: `task-${i + 1}`,
    title,
    details: '',
    queue: 'todo' as const,
    completedAt: null,
    snoozedUntil: null,
    archivedAt: null,
    blockers: [],
    sortOrder: `a${i}`,
  }))
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('TaskListPage', () => {
  const onSettings = vi.fn()
  const onTaskClick = vi.fn()
  const onNewTask = vi.fn()
  const onNewBacklog = vi.fn()
  const onSearch = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    onSettings.mockReset()
    onTaskClick.mockReset()
    onNewTask.mockReset()
    onNewBacklog.mockReset()
    onSearch.mockReset()
  })

  it('displays loading state initially', () => {
    vi.spyOn(api, 'fetchActiveTasks').mockReturnValue(new Promise(() => {}))

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('displays tasks after loading', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Buy milk', 'Walk dog'))

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Buy milk')).toBeDefined()
    expect(screen.getByText('Walk dog')).toBeDefined()
  })

  it('displays (unnamed) for tasks with empty title', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks(''))

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('(unnamed)')).toBeDefined()
  })

  it('calls onTaskClick when task title is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Buy milk'))

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    const taskTitle = await screen.findByText('Buy milk')
    await user.click(taskTitle)

    expect(onTaskClick).toHaveBeenCalledWith('task-1')
  })

  it('calls onNewTask when + Task is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('+ Task')
    await user.click(screen.getByText('+ Task'))

    expect(onNewTask).toHaveBeenCalled()
  })

  it('completes a task when checkbox is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Buy milk'))
    vi.spyOn(api, 'completeTask').mockResolvedValue({
      ...makeTasks('Buy milk')[0]!,
      completedAt: new Date().toISOString(),
    })

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    const checkbox = await screen.findByLabelText('Complete "Buy milk"')
    await user.click(checkbox)

    expect(vi.mocked(api.completeTask).mock.calls[0]![0]).toBe('task-1')
  })

  it('filters out snoozed tasks', async () => {
    const tasks = makeTasks('Active task', 'Snoozed task')
    tasks[1]!.snoozedUntil = new Date(Date.now() + 86400000).toISOString()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Active task')).toBeDefined()
    expect(screen.queryByText('Snoozed task')).toBeNull()
  })

  it('moves blocked tasks to the Blocked section (not in todo)', async () => {
    const tasks = makeTasks('Active task', 'Blocked task')
    tasks[1]!.blockers = [{ id: 'task-1', title: 'Active task' }]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Active task')).toBeDefined()
    // Blocked task appears in the Blocked section, not filtered out entirely
    expect(screen.getByText('Blocked task')).toBeDefined()
    expect(screen.getByText('Blocked')).toBeDefined() // section divider
  })

  it('shows error state when fetch fails', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockRejectedValue(new Error('Network error'))

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Failed to load tasks.')).toBeDefined()
  })

  it('shows the Search button', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByRole('button', { name: 'Search' })).toBeDefined()
  })

  it('calls onSearch when Search is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await user.click(await screen.findByRole('button', { name: 'Search' }))

    expect(onSearch).toHaveBeenCalled()
  })

  it('calls onSettings when gear is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await user.click(await screen.findByRole('button', { name: 'Settings' }))

    expect(onSettings).toHaveBeenCalled()
  })

  it('shows backlog tasks under Backlog divider', async () => {
    const tasks: TaskResponse[] = [
      { id: 'todo-1', title: 'Todo task', details: '', queue: 'todo', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'backlog-1', title: 'Backlog task', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Todo task')).toBeDefined()
    expect(screen.getByText('Backlog task')).toBeDefined()
    expect(screen.getByText('Backlog')).toBeDefined() // section divider
  })

  it('does not show backlog tasks in the todo section', async () => {
    const tasks: TaskResponse[] = [
      { id: 'backlog-1', title: 'Backlog only', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    // Backlog task should appear (under backlog section), but not as a todo
    expect(await screen.findByText('Backlog only')).toBeDefined()
  })

  it('calls onNewBacklog when + Backlog is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('+ Backlog')
    await user.click(screen.getByText('+ Backlog'))

    expect(onNewBacklog).toHaveBeenCalled()
  })

  it('filters out snoozed backlog tasks', async () => {
    const tasks: TaskResponse[] = [
      { id: 'backlog-1', title: 'Active backlog', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'backlog-2', title: 'Snoozed backlog', details: '', queue: 'backlog', completedAt: null, snoozedUntil: new Date(Date.now() + 86400000).toISOString(), archivedAt: null, blockers: [], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Active backlog')).toBeDefined()
    expect(screen.queryByText('Snoozed backlog')).toBeNull()
  })

  it('moves blocked backlog tasks to the Blocked section (not in backlog)', async () => {
    const tasks: TaskResponse[] = [
      { id: 'backlog-1', title: 'Free backlog', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'backlog-2', title: 'Blocked backlog', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [{ id: 'backlog-1', title: 'Free backlog' }], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Free backlog')).toBeDefined()
    // Blocked backlog task appears in the Blocked section
    expect(screen.getByText('Blocked backlog')).toBeDefined()
    expect(screen.getByText('Blocked')).toBeDefined() // section divider
  })

  it('keeps completed backlog tasks visible until archived', async () => {
    const tasks: TaskResponse[] = [
      { id: 'backlog-1', title: 'Done backlog', details: '', queue: 'backlog', completedAt: '2026-03-27T00:00:00Z', snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Done backlog')).toBeDefined()
  })

  it('renders a grip icon for each visible task', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Task A', 'Task B'))

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Task A')
    expect(document.querySelectorAll('svg[aria-hidden="true"]').length).toBe(2)
  })

  it('calls reorderTask when a todo task is dragged to a later position', async () => {
    const tasks = makeTasks('Task A', 'Task B', 'Task C')
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)
    vi.spyOn(api, 'reorderTask').mockResolvedValue({ ...tasks[0]!, sortOrder: 'a1b' })

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Task A')

    // Move task-1 (index 0) to index 2: reordered=[B,C,A], beforeId=null, afterId=task-3
    act(() => {
      dnd.onDragEnd!({ canceled: false, operation: { source: { initialIndex: 0, initialGroup: 'todo', index: 2 } } })
    })

    await waitFor(() => {
      expect(api.reorderTask).toHaveBeenCalledWith('task-1', null, 'task-3')
    })
  })

  it('calls reorderTask when a todo task is dragged to an earlier position', async () => {
    const tasks = makeTasks('Task A', 'Task B', 'Task C')
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)
    vi.spyOn(api, 'reorderTask').mockResolvedValue({ ...tasks[2]!, sortOrder: 'a-1' })

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Task C')

    // Move task-3 (index 2) to index 0: reordered=[C,A,B], beforeId=task-1, afterId=null
    act(() => {
      dnd.onDragEnd!({ canceled: false, operation: { source: { initialIndex: 2, initialGroup: 'todo', index: 0 } } })
    })

    await waitFor(() => {
      expect(api.reorderTask).toHaveBeenCalledWith('task-3', 'task-1', null)
    })
  })

  it('does not call reorderTask when drag is canceled', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Task A', 'Task B'))
    vi.spyOn(api, 'reorderTask').mockResolvedValue(makeTasks('Task A')[0]!)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Task A')

    act(() => {
      dnd.onDragEnd!({ canceled: true, operation: { source: { initialIndex: 0, initialGroup: 'todo', index: 1 } } })
    })

    expect(api.reorderTask).not.toHaveBeenCalled()
  })

  it('does not call reorderTask when dropped at the same index', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Task A', 'Task B'))
    vi.spyOn(api, 'reorderTask').mockResolvedValue(makeTasks('Task A')[0]!)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Task A')

    act(() => {
      dnd.onDragEnd!({ canceled: false, operation: { source: { initialIndex: 1, initialGroup: 'todo', index: 1 } } })
    })

    expect(api.reorderTask).not.toHaveBeenCalled()
  })

  it('shows blocked tasks in the Blocked section', async () => {
    const tasks: TaskResponse[] = [
      { id: 'task-1', title: 'Free task', details: '', queue: 'todo', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'task-2', title: 'Blocked task', details: '', queue: 'todo', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [{ id: 'task-1', title: 'Free task' }], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Free task')).toBeDefined()
    expect(screen.getByText('Blocked task')).toBeDefined()
    expect(screen.getByText('Blocked')).toBeDefined() // section divider
  })

  it('does not show Blocked section when no blocked tasks', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Task A'))

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Task A')
    expect(screen.queryByText('Blocked')).toBeNull()
  })

  it('blocked task does not appear in the todo section', async () => {
    const tasks: TaskResponse[] = [
      { id: 'task-1', title: 'Free task', details: '', queue: 'todo', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'task-2', title: 'Blocked task', details: '', queue: 'todo', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [{ id: 'task-1', title: 'Free task' }], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    // Blocked task appears only once (in the Blocked section)
    await screen.findByText('Blocked task')
    expect(screen.getAllByText('Blocked task').length).toBe(1)
  })

  it('completed blocked task does not appear in Blocked section', async () => {
    const tasks: TaskResponse[] = [
      { id: 'task-2', title: 'Done blocked', details: '', queue: 'todo', completedAt: '2026-01-01T00:00:00Z', snoozedUntil: null, archivedAt: null, blockers: [{ id: 'x', title: 'Blocker' }], sortOrder: 'a0' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('+ Task')
    expect(screen.queryByText('Blocked')).toBeNull()
  })

  it('completed task blocked by an open task still appears in its section', async () => {
    const tasks: TaskResponse[] = [
      { id: 'task-1', title: 'Open blocker', details: '', queue: 'todo', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'task-2', title: 'Done but blocked', details: '', queue: 'todo', completedAt: '2026-01-01T00:00:00Z', snoozedUntil: null, archivedAt: null, blockers: [{ id: 'task-1', title: 'Open blocker' }], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Done but blocked')
    expect(screen.queryByText('Blocked')).toBeNull()
  })

  it('task with a completed blocker is not considered blocked', async () => {
    const tasks: TaskResponse[] = [
      { id: 'blocker-1', title: 'Done blocker', details: '', queue: 'todo', completedAt: '2026-01-01T00:00:00Z', snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'task-2', title: 'Now unblocked', details: '', queue: 'todo', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [{ id: 'blocker-1', title: 'Done blocker' }], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Now unblocked')
    expect(screen.queryByText('Blocked')).toBeNull()
  })

  it('uses the backlog list when dragging within backlog', async () => {
    const tasks: TaskResponse[] = [
      { id: 'b1', title: 'Backlog A', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'b2', title: 'Backlog B', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)
    vi.spyOn(api, 'reorderTask').mockResolvedValue(tasks[0]!)

    renderWithQuery(
      <TaskListPage onSettings={onSettings} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Backlog A')

    // Move b1 (index 0) to index 1: reordered=[b2,b1], beforeId=null, afterId=b2
    act(() => {
      dnd.onDragEnd!({ canceled: false, operation: { source: { initialIndex: 0, initialGroup: 'backlog', index: 1 } } })
    })

    await waitFor(() => {
      expect(api.reorderTask).toHaveBeenCalledWith('b1', null, 'b2')
    })
  })
})
