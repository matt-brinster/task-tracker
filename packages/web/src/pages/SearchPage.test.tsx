import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SearchPage from './SearchPage.tsx'
import * as api from '../api.ts'
import type { TaskResponse } from '../types.ts'

vi.mock('use-debounce', () => ({
  useDebouncedCallback: (fn: (...args: unknown[]) => unknown) => fn,
}))

function makeTask(overrides: Partial<TaskResponse> & { title: string }): TaskResponse {
  return {
    id: 'task-1',
    details: '',
    queue: 'todo',
    completedAt: null,
    snoozedUntil: null,
    archivedAt: null,
    blockers: [],
    sortOrder: 'a0',
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

describe('SearchPage', () => {
  const onBack = vi.fn()
  const onTaskClick = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    onBack.mockReset()
    onTaskClick.mockReset()
  })

  it('renders the search input', () => {
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    expect(screen.getByPlaceholderText('Search tasks...')).toBeDefined()
  })

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup()
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    await user.click(screen.getByLabelText('Back'))

    expect(onBack).toHaveBeenCalled()
  })

  it('shows nothing before the user types', () => {
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    expect(screen.queryByText('No results')).toBeNull()
    expect(screen.queryByText('Searching...')).toBeNull()
  })

  it('calls searchTasks when the user types', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'searchTasks').mockResolvedValue([])
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    await user.type(screen.getByPlaceholderText('Search tasks...'), 'milk')

    expect(vi.mocked(api.searchTasks)).toHaveBeenCalledWith('milk')
  })

  it('shows results after search', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'searchTasks').mockResolvedValue([makeTask({ title: 'Buy milk' })])
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    await user.type(screen.getByPlaceholderText('Search tasks...'), 'milk')

    expect(await screen.findByText('Buy milk')).toBeDefined()
  })

  it('shows "No results" when search returns empty', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'searchTasks').mockResolvedValue([])
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    await user.type(screen.getByPlaceholderText('Search tasks...'), 'zebra')

    expect(await screen.findByText('No results')).toBeDefined()
  })

  it('shows (unnamed) for tasks with empty title', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'searchTasks').mockResolvedValue([makeTask({ title: '' })])
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    await user.type(screen.getByPlaceholderText('Search tasks...'), 'x')

    expect(await screen.findByText('(unnamed)')).toBeDefined()
  })

  it('calls onTaskClick when a result row is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'searchTasks').mockResolvedValue([makeTask({ title: 'Buy milk' })])
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    await user.type(screen.getByPlaceholderText('Search tasks...'), 'milk')
    await user.click(await screen.findByText('Buy milk'))

    expect(onTaskClick).toHaveBeenCalledWith('task-1')
  })

  it('calls completeTask when checkbox is clicked on an open task', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'searchTasks').mockResolvedValue([makeTask({ title: 'Buy milk' })])
    vi.spyOn(api, 'completeTask').mockResolvedValue(
      makeTask({ title: 'Buy milk', completedAt: new Date().toISOString() })
    )
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    await user.type(screen.getByPlaceholderText('Search tasks...'), 'milk')
    await user.click(await screen.findByLabelText('Complete "Buy milk"'))

    expect(vi.mocked(api.completeTask).mock.calls[0]![0]).toBe('task-1')
  })

  it('calls reopenTask when checkbox is clicked on a completed task', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'searchTasks').mockResolvedValue([
      makeTask({ title: 'Buy milk', completedAt: '2026-03-01T00:00:00Z' }),
    ])
    vi.spyOn(api, 'reopenTask').mockResolvedValue(makeTask({ title: 'Buy milk' }))
    renderWithQuery(<SearchPage onBack={onBack} onTaskClick={onTaskClick} />)

    await user.type(screen.getByPlaceholderText('Search tasks...'), 'milk')
    await user.click(await screen.findByLabelText('Reopen "Buy milk"'))

    expect(vi.mocked(api.reopenTask).mock.calls[0]![0]).toBe('task-1')
  })
})
