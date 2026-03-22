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

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    onLogout.mockReset()
    onTaskClick.mockReset()
    onNewTask.mockReset()
  })

  it('displays loading state initially', () => {
    vi.spyOn(api, 'fetchActiveTasks').mockReturnValue(new Promise(() => {}))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
    )

    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('displays tasks after loading', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Buy milk', 'Walk dog'))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
    )

    expect(await screen.findByText('Buy milk')).toBeDefined()
    expect(screen.getByText('Walk dog')).toBeDefined()
  })

  it('displays (unnamed) for tasks with empty title', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks(''))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
    )

    expect(await screen.findByText('(unnamed)')).toBeDefined()
  })

  it('calls onTaskClick when task title is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(makeTasks('Buy milk'))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
    )

    const taskTitle = await screen.findByText('Buy milk')
    await user.click(taskTitle)

    expect(onTaskClick).toHaveBeenCalledWith('task-1')
  })

  it('calls onNewTask when + Task is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
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
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
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
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
    )

    expect(await screen.findByText('Active task')).toBeDefined()
    expect(screen.queryByText('Snoozed task')).toBeNull()
  })

  it('filters out blocked tasks', async () => {
    const tasks = makeTasks('Active task', 'Blocked task')
    tasks[1]!.blockers = [{ id: 'other', title: 'Other task' }]
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue(tasks)

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
    )

    expect(await screen.findByText('Active task')).toBeDefined()
    expect(screen.queryByText('Blocked task')).toBeNull()
  })

  it('shows error state when fetch fails', async () => {
    vi.spyOn(api, 'fetchActiveTasks').mockRejectedValue(new Error('Network error'))

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
    )

    expect(await screen.findByText('Failed to load tasks.')).toBeDefined()
  })

  it('calls onLogout and clears token when Logout is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchActiveTasks').mockResolvedValue([])

    renderWithQuery(
      <TaskListPage onLogout={onLogout} onTaskClick={onTaskClick} onNewTask={onNewTask} />
    )

    await screen.findByText('+ Task')
    await user.click(screen.getByText('Logout'))

    expect(onLogout).toHaveBeenCalled()
  })
})
