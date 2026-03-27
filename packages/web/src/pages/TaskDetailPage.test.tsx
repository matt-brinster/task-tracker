import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

    expect(await screen.findByDisplayValue('Buy milk')).toBeDefined()
    expect(screen.getByDisplayValue('From the store')).toBeDefined()
  })

  it('shows checkbox for existing tasks', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByLabelText('Complete "Buy milk"')).toBeDefined()
  })

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await screen.findByDisplayValue('Buy milk')
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

    await screen.findByDisplayValue('Buy milk')
    await user.click(screen.getByLabelText('Delete task'))

    expect(vi.mocked(api.deleteTask).mock.calls[0]![0]).toBe('task-1')
  })

  it('autosaves title changes after debounce', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())
    vi.spyOn(api, 'updateTask').mockResolvedValue(makeTask({ title: 'Buy oat milk' }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    const titleInput = await screen.findByDisplayValue('Buy milk')
    await user.clear(titleInput)
    await user.type(titleInput, 'Buy oat milk')

    await waitFor(() => {
      expect(api.updateTask).toHaveBeenCalledWith('task-1', {
        title: 'Buy oat milk',
        details: 'From the store',
      })
    })
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

  it('renders the form with empty fields and delete button', () => {
    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    expect(screen.getByPlaceholderText('Task name')).toBeDefined()
    expect(screen.getByPlaceholderText('Details (optional)')).toBeDefined()
    expect(screen.getByLabelText('Delete task')).toBeDefined()
  })

  it('shows disabled checkbox before task is created', () => {
    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    const checkbox = screen.getByRole('button', { name: /Complete/ })
    expect(checkbox).toHaveProperty('disabled', true)
  })

  it('creates task via autosave when title is typed', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTask').mockResolvedValue(makeTask({ id: 'new-1', title: 'New task' }))

    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    await user.type(screen.getByPlaceholderText('Task name'), 'New task')

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith('New task', '', 'todo')
    })
  })

  it('does not create when title is only whitespace', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    await user.type(screen.getByPlaceholderText('Task name'), '   ')

    // Wait longer than the debounce to be sure it doesn't fire
    await new Promise(r => setTimeout(r, 700))

    expect(api.createTask).not.toHaveBeenCalled()
  })

  it('navigates back on delete when task not yet created', async () => {
    const user = userEvent.setup()

    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    await user.click(screen.getByLabelText('Delete task'))

    expect(onBack).toHaveBeenCalled()
  })

  it('shows error when creation fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTask').mockRejectedValue(new api.ApiError(400, 'title is required'))

    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    await user.type(screen.getByPlaceholderText('Task name'), 'x')

    await waitFor(() => {
      expect(screen.getByText('Failed to save task.')).toBeDefined()
    })
  })
})

describe('TaskDetailPage — queue toggle', () => {
  const onBack = vi.fn()

  function getTodoRadio() {
    return screen.getByRole('radio', { name: 'Todo' })
  }
  function getBacklogRadio() {
    return screen.getByRole('radio', { name: 'Backlog' })
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    onBack.mockReset()
  })

  it('has Todo selected for a todo task', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask({ queue: 'todo' }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await screen.findByRole('radiogroup', { name: 'Task queue' })
    expect(getTodoRadio().getAttribute('aria-checked')).toBe('true')
    expect(getBacklogRadio().getAttribute('aria-checked')).toBe('false')
  })

  it('has Backlog selected for a backlog task', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask({ queue: 'backlog' }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await screen.findByRole('radiogroup', { name: 'Task queue' })
    expect(getBacklogRadio().getAttribute('aria-checked')).toBe('true')
    expect(getTodoRadio().getAttribute('aria-checked')).toBe('false')
  })

  it('calls setQueue when Backlog is clicked on a todo task', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask({ queue: 'todo' }))
    vi.spyOn(api, 'setQueue').mockResolvedValue(makeTask({ queue: 'backlog' }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await screen.findByRole('radiogroup', { name: 'Task queue' })
    await user.click(getBacklogRadio())

    expect(api.setQueue).toHaveBeenCalledWith('task-1', 'backlog')
  })

  it('updates aria-checked immediately after toggle', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask({ queue: 'todo' }))
    vi.spyOn(api, 'setQueue').mockResolvedValue(makeTask({ queue: 'backlog' }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await screen.findByRole('radiogroup', { name: 'Task queue' })
    await user.click(getBacklogRadio())

    expect(getBacklogRadio().getAttribute('aria-checked')).toBe('true')
    expect(getTodoRadio().getAttribute('aria-checked')).toBe('false')
  })

  it('new task via + Task has Todo selected', () => {
    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    expect(getTodoRadio().getAttribute('aria-checked')).toBe('true')
    expect(getBacklogRadio().getAttribute('aria-checked')).toBe('false')
  })

  it('new task via + Backlog has Backlog selected', () => {
    renderWithQuery(<TaskDetailPage taskId={null} initialQueue="backlog" onBack={onBack} />)

    expect(getBacklogRadio().getAttribute('aria-checked')).toBe('true')
    expect(getTodoRadio().getAttribute('aria-checked')).toBe('false')
  })

  it('user changes mind: starts backlog, switches to todo, then types — creates with todo', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTask').mockResolvedValue(makeTask({ id: 'new-1', title: 'Changed mind', queue: 'todo' }))

    renderWithQuery(<TaskDetailPage taskId={null} initialQueue="backlog" onBack={onBack} />)

    // Switch from backlog to todo
    await user.click(getTodoRadio())
    expect(getTodoRadio().getAttribute('aria-checked')).toBe('true')

    // Type a title to trigger autosave
    await user.type(screen.getByPlaceholderText('Task name'), 'Changed mind')

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith('Changed mind', '', 'todo')
    })
  })

  it('user changes mind: starts todo, switches to backlog, then types — creates with backlog', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTask').mockResolvedValue(makeTask({ id: 'new-1', title: 'To backlog', queue: 'backlog' }))

    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    // Switch from todo to backlog
    await user.click(getBacklogRadio())
    expect(getBacklogRadio().getAttribute('aria-checked')).toBe('true')

    // Type a title to trigger autosave
    await user.type(screen.getByPlaceholderText('Task name'), 'To backlog')

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith('To backlog', '', 'backlog')
    })
  })

  it('does not call setQueue API for new unsaved tasks', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'setQueue').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    await user.click(getBacklogRadio())

    expect(api.setQueue).not.toHaveBeenCalled()
  })
})
