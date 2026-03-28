import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaskListPage from './TaskListPage.tsx'
import * as api from '../api.ts'
import type { TaskResponse } from '../types.ts'

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
  const onLogout = vi.fn()
  const onTaskClick = vi.fn()
  const onNewTask = vi.fn()
  const onNewBacklog = vi.fn()
  const onSearch = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    onLogout.mockReset()
    onTaskClick.mockReset()
    onNewTask.mockReset()
    onNewBacklog.mockReset()
    onSearch.mockReset()
  })

  it('displays loading state initially', () => {
    vi.spyOn(api, 'fetchActiveTasks').mockReturnValue(new Promise(() => {}))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('displays tasks after loading', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Buy milk', 'Walk dog'))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Buy milk')).toBeDefined()
    expect(screen.getByText('Walk dog')).toBeDefined()
  })

  it('displays (unnamed) for tasks with empty title', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks(''))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('(unnamed)')).toBeDefined()
  })

  it('calls onTaskClick when task title is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Buy milk'))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    const taskTitle = await screen.findByText('Buy milk')
    await user.click(taskTitle)

    expect(onTaskClick).toHaveBeenCalledWith('task-1')
  })

  it('calls onNewTask when + Task is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
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
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
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
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Active task')).toBeDefined()
    expect(screen.queryByText('Snoozed task')).toBeNull()
  })

  it('filters out blocked tasks', async () => {
    const tasks = makeTasks('Active task', 'Blocked task')
    tasks[1]!.blockers = [{ id: 'other', title: 'Other task' }]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Active task')).toBeDefined()
    expect(screen.queryByText('Blocked task')).toBeNull()
  })

  it('shows error state when fetch fails', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockRejectedValue(new Error('Network error'))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Failed to load tasks.')).toBeDefined()
  })

  it('shows the Search button', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Search')).toBeDefined()
  })

  it('calls onSearch when Search is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('Search')
    await user.click(screen.getByText('Search'))

    expect(onSearch).toHaveBeenCalled()
  })

  it('calls onLogout and clears token when Logout is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    await screen.findByText('+ Task')
    await user.click(screen.getByText('Logout'))

    expect(onLogout).toHaveBeenCalled()
  })

  it('shows backlog tasks under Backlog divider', async () => {
    const tasks: TaskResponse[] = [
      { id: 'todo-1', title: 'Todo task', details: '', queue: 'todo', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'backlog-1', title: 'Backlog task', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
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
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    // Backlog task should appear (under backlog section), but not as a todo
    expect(await screen.findByText('Backlog only')).toBeDefined()
  })

  it('calls onNewBacklog when + Backlog is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
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
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Active backlog')).toBeDefined()
    expect(screen.queryByText('Snoozed backlog')).toBeNull()
  })

  it('filters out blocked backlog tasks', async () => {
    const tasks: TaskResponse[] = [
      { id: 'backlog-1', title: 'Free backlog', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
      { id: 'backlog-2', title: 'Blocked backlog', details: '', queue: 'backlog', completedAt: null, snoozedUntil: null, archivedAt: null, blockers: [{ id: 'x', title: 'Blocker' }], sortOrder: 'a1' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Free backlog')).toBeDefined()
    expect(screen.queryByText('Blocked backlog')).toBeNull()
  })

  it('keeps completed backlog tasks visible until archived', async () => {
    const tasks: TaskResponse[] = [
      { id: 'backlog-1', title: 'Done backlog', details: '', queue: 'backlog', completedAt: '2026-03-27T00:00:00Z', snoozedUntil: null, archivedAt: null, blockers: [], sortOrder: 'a0' },
    ]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} onNewBacklog={onNewBacklog} onSearch={onSearch} />
    )

    expect(await screen.findByText('Done backlog')).toBeDefined()
  })
})
