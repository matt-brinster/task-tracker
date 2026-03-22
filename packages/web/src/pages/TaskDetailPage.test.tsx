import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaskDetailPage from './TaskDetailPage.tsx'
import * as api from '../api.ts'
import type { TaskResponse } from '../types.ts'

function makeTask(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: 'task-1',
    title: 'Buy milk',
    details: 'From the store',
    queue: 'todo',
    completedAt: null,
    snoozedUntil: null,
    archivedAt: null,
    blockers: [],
    ...overrides,
  }
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('TaskDetailPage — existing task', () => {
  const onBack = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    onBack.mockReset()
  })

  it('displays task title and details', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByText('Buy milk')).toBeDefined()
    expect(screen.getByDisplayValue('From the store')).toBeDefined()
  })

  it('displays (unnamed) for tasks with empty title', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask({ title: '' }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByText('(unnamed)')).toBeDefined()
  })

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await screen.findByText('Buy milk')
    await user.click(screen.getByLabelText('Back'))

    expect(onBack).toHaveBeenCalled()
  })

  it('completes a task when checkbox is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())
    vi.spyOn(api, 'completeTask').mockResolvedValue(makeTask({ completedAt: new Date().toISOString() }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    const checkbox = await screen.findByLabelText('Complete "Buy milk"')
    await user.click(checkbox)

    expect(vi.mocked(api.completeTask).mock.calls[0]![0]).toBe('task-1')
  })

  it('deletes a task and navigates back', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())
    vi.spyOn(api, 'deleteTask').mockResolvedValue(undefined)

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await screen.findByText('Buy milk')
    await user.click(screen.getByLabelText('Delete task'))

    expect(vi.mocked(api.deleteTask).mock.calls[0]![0]).toBe('task-1')
  })

  it('shows error state when fetch fails', async () => {
    vi.spyOn(api, 'fetchTask').mockRejectedValue(new Error('Network error'))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByText('Failed to load task.')).toBeDefined()
  })
})

describe('TaskDetailPage — new task', () => {
  const onBack = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    onBack.mockReset()
  })

  it('renders the create form', () => {
    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    expect(screen.getByPlaceholderText('Task name')).toBeDefined()
    expect(screen.getByPlaceholderText('Details (optional)')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Create Task' })).toBeDefined()
  })

  it('disables create button when title is empty', () => {
    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    const button = screen.getByRole('button', { name: 'Create Task' })
    expect(button).toHaveProperty('disabled', true)
  })

  it('creates a task and navigates back', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTask').mockResolvedValue(makeTask({ title: 'New task' }))

    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    await user.type(screen.getByPlaceholderText('Task name'), 'New task')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(api.createTask).toHaveBeenCalledWith('New task', '')
  })

  it('shows error when creation fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTask').mockRejectedValue(new api.ApiError(400, 'title is required'))

    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    await user.type(screen.getByPlaceholderText('Task name'), 'x')
    await user.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(await screen.findByText('Failed to create task.')).toBeDefined()
  })
})
