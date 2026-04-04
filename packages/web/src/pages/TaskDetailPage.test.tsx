import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaskDetailPage from './TaskDetailPage.tsx'
import * as api from '../api.ts'
import type { TaskResponse } from '../types.ts'

// stub SectionDivider to avoid rendering noise
vi.mock('../components/SectionDivider.tsx', () => ({
  default: ({ label }: { label: string }) => <div data-testid={`divider-${label}`}>{label}</div>,
}))

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
    sortOrder: 'a0',
    ...overrides,
  }
}

function createQueryClient(initialTasks?: TaskResponse[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  if (initialTasks) {
    queryClient.setQueryData(['tasks'], initialTasks)
  }
  return queryClient
}

function renderWithQuery(ui: React.ReactElement, queryClient?: QueryClient) {
  const qc = queryClient ?? createQueryClient()
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
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

describe('TaskDetailPage — blockers section', () => {
  const onBack = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    onBack.mockReset()
  })

  it('shows Blockers section for existing tasks', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByTestId('divider-Blockers')).toBeDefined()
  })

  it('shows blocker titles in the list', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(
      makeTask({ blockers: [{ id: 'blocker-1', title: 'Fix the bug' }] })
    )

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByText('Fix the bug')).toBeDefined()
  })

  it('shows + Blocker button', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByText('+ Blocker')).toBeDefined()
  })

  it('opens search input when + Blocker is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())
    vi.spyOn(api, 'fetchOpenTasks').mockResolvedValue([])

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await user.click(await screen.findByText('+ Blocker'))

    expect(screen.getByPlaceholderText('Search tasks...')).toBeDefined()
  })

  it('calls addBlocker when a search result is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())
    vi.spyOn(api, 'fetchOpenTasks').mockResolvedValue([
      makeTask({ id: 'other-1', title: 'Other task' }),
    ])
    vi.spyOn(api, 'addBlocker').mockResolvedValue(
      makeTask({ blockers: [{ id: 'other-1', title: 'Other task' }] })
    )

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await user.click(await screen.findByText('+ Blocker'))
    await user.click(await screen.findByText('Other task'))

    await waitFor(() => {
      expect(api.addBlocker).toHaveBeenCalledWith('task-1', 'other-1')
    })
  })

  it('calls removeBlocker when remove button is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(
      makeTask({ blockers: [{ id: 'blocker-1', title: 'Fix the bug' }] })
    )
    vi.spyOn(api, 'removeBlocker').mockResolvedValue(makeTask({ blockers: [] }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await user.click(await screen.findByLabelText('Remove blocker "Fix the bug"'))

    await waitFor(() => {
      expect(api.removeBlocker).toHaveBeenCalledWith('task-1', 'blocker-1')
    })
  })

  it('closes search and shows + Blocker again after clicking the back button', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())
    vi.spyOn(api, 'fetchOpenTasks').mockResolvedValue([])

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await user.click(await screen.findByText('+ Blocker'))
    expect(screen.getByPlaceholderText('Search tasks...')).toBeDefined()

    // Two Back buttons exist: the page header and the search close button
    const backButtons = screen.getAllByLabelText('Back')
    await user.click(backButtons[backButtons.length - 1]!)

    expect(screen.queryByPlaceholderText('Search tasks...')).toBeNull()
    expect(screen.getByText('+ Blocker')).toBeDefined()
  })

  it('shows Blockers section greyed out for new tasks', () => {
    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    expect(screen.queryByTestId('divider-Blockers')).not.toBeNull()
    const wrapper = screen.getByTestId('divider-Blockers').closest('[aria-disabled]')
    expect(wrapper?.getAttribute('aria-disabled')).toBe('true')
  })

  it('shows blocker as incomplete when found in active tasks cache', async () => {
    const blockerInCache = makeTask({ id: 'blocker-1', title: 'Fix the bug', completedAt: null })
    const qc = createQueryClient([blockerInCache])

    vi.spyOn(api, 'fetchTask').mockResolvedValue(
      makeTask({ blockers: [{ id: 'blocker-1', title: 'Fix the bug' }] })
    )

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />, qc)

    // Verify blocker title appears, then check the checkbox state
    await screen.findByText('Fix the bug')
    // Blocker is in cache with completedAt: null → shows as incomplete
    expect(screen.getByLabelText('Complete "Fix the bug"')).toBeDefined()
  })

  it('shows blocker as completed when not in active tasks cache', async () => {
    const qc = createQueryClient([]) // empty cache — blocker not present
    const parentTask = makeTask({ blockers: [{ id: 'blocker-1', title: 'Fix the bug' }] })
    const completedBlocker = makeTask({ id: 'blocker-1', title: 'Fix the bug', completedAt: '2025-01-01T00:00:00.000Z' })

    vi.spyOn(api, 'fetchTask')
      .mockResolvedValueOnce(parentTask)    // fetch for task-1
      .mockResolvedValueOnce(completedBlocker) // fetch for blocker-1

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />, qc)

    // Blocker fetched individually and found completed
    expect(await screen.findByLabelText('Reopen "Fix the bug"')).toBeDefined()
  })
})

describe('TaskDetailPage — internal navigation stack', () => {
  const onBack = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    onBack.mockReset()
  })

  it('does not show parent back button when there is no stack history', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await screen.findByDisplayValue('Buy milk')
    expect(screen.queryByLabelText('Back to parent task')).toBeNull()
  })

  it('navigates to blocker task when blocker row is clicked', async () => {
    const user = userEvent.setup()
    const blockerTask = makeTask({ id: 'blocker-1', title: 'Fix the bug', blockers: [] })
    const parentTask = makeTask({ blockers: [{ id: 'blocker-1', title: 'Fix the bug' }] })
    const qc = createQueryClient([blockerTask, parentTask])

    vi.spyOn(api, 'fetchTask')
      .mockResolvedValueOnce(parentTask)    // detail page fetch
      .mockResolvedValueOnce(blockerTask)   // BlockerRow fetch
      .mockResolvedValueOnce(blockerTask)   // navigate into blocker

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />, qc)

    // Click the blocker row text to navigate to it
    await user.click(await screen.findByText('Fix the bug'))

    // Should now show the blocker task's title
    expect(await screen.findByDisplayValue('Fix the bug')).toBeDefined()
  })

  it('shows parent back button after navigating to a blocker', async () => {
    const user = userEvent.setup()
    const blockerTask = makeTask({ id: 'blocker-1', title: 'Fix the bug', blockers: [] })
    const parentTask = makeTask({ blockers: [{ id: 'blocker-1', title: 'Fix the bug' }] })
    const qc = createQueryClient([blockerTask, parentTask])

    vi.spyOn(api, 'fetchTask')
      .mockResolvedValueOnce(parentTask)    // detail page fetch
      .mockResolvedValueOnce(blockerTask)   // BlockerRow fetch
      .mockResolvedValueOnce(blockerTask)   // navigate into blocker

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />, qc)

    await user.click(await screen.findByText('Fix the bug'))
    await screen.findByDisplayValue('Fix the bug')

    expect(screen.getByLabelText('Back to parent task')).toBeDefined()
  })

  it('parent back button returns to the previous task', async () => {
    const user = userEvent.setup()
    const blockerTask = makeTask({ id: 'blocker-1', title: 'Fix the bug', blockers: [] })
    const parentTask = makeTask({ blockers: [{ id: 'blocker-1', title: 'Fix the bug' }] })
    const qc = createQueryClient([blockerTask, parentTask])

    vi.spyOn(api, 'fetchTask')
      .mockResolvedValueOnce(parentTask)    // detail page fetch
      .mockResolvedValueOnce(blockerTask)   // BlockerRow fetch
      .mockResolvedValueOnce(blockerTask)   // navigate into blocker
      .mockResolvedValueOnce(parentTask)    // navigate back to parent
      .mockResolvedValueOnce(blockerTask)   // BlockerRow fetch again

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />, qc)

    await user.click(await screen.findByText('Fix the bug'))
    await screen.findByDisplayValue('Fix the bug')

    await user.click(screen.getByLabelText('Back to parent task'))

    // Should be back on the parent task
    expect(await screen.findByDisplayValue('Buy milk')).toBeDefined()
    // Parent back button should be gone (stack is empty)
    expect(screen.queryByLabelText('Back to parent task')).toBeNull()
  })

  it('list back button always calls onBack regardless of stack depth', async () => {
    const user = userEvent.setup()
    const blockerTask = makeTask({ id: 'blocker-1', title: 'Fix the bug', blockers: [] })
    const parentTask = makeTask({ blockers: [{ id: 'blocker-1', title: 'Fix the bug' }] })
    const qc = createQueryClient([blockerTask, parentTask])

    vi.spyOn(api, 'fetchTask')
      .mockResolvedValueOnce(parentTask)    // detail page fetch
      .mockResolvedValueOnce(blockerTask)   // BlockerRow fetch
      .mockResolvedValueOnce(blockerTask)   // navigate into blocker

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />, qc)

    await user.click(await screen.findByText('Fix the bug'))
    await screen.findByDisplayValue('Fix the bug')

    // Click the list back button (^), not the parent back button (<)
    await user.click(screen.getByLabelText('Back'))

    expect(onBack).toHaveBeenCalled()
  })

  it('navigating to new blocker shows empty form with parent back button', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())
    vi.spyOn(api, 'fetchOpenTasks').mockResolvedValue([])

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await user.click(await screen.findByText('+ Blocker'))
    await user.click(await screen.findByText('+ New blocker'))

    // Should show an empty task form
    expect(screen.getByPlaceholderText('Task name')).toBeDefined()
    // Should have parent back button
    expect(screen.getByLabelText('Back to parent task')).toBeDefined()
  })
})

describe('TaskDetailPage — snooze section', () => {
  const onBack = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    onBack.mockReset()
  })

  it('shows Snooze section for existing tasks', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByTestId('divider-Snooze')).toBeDefined()
  })

  it('shows Snooze section greyed out for new tasks', () => {
    renderWithQuery(<TaskDetailPage taskId={null} onBack={onBack} />)

    expect(screen.queryByTestId('divider-Snooze')).not.toBeNull()
    const wrapper = screen.getByTestId('divider-Snooze').closest('[aria-disabled]')
    expect(wrapper?.getAttribute('aria-disabled')).toBe('true')
  })

  it('shows 1 Hour button when task is not snoozed', async () => {
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByText('1 Hour')).toBeDefined()
  })

  it('calls snoozeTask when 1 Hour button is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask())
    vi.spyOn(api, 'snoozeTask').mockResolvedValue(
      makeTask({ snoozedUntil: new Date(Date.now() + 3600000).toISOString() })
    )

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await user.click(await screen.findByText('1 Hour'))

    expect(api.snoozeTask).toHaveBeenCalledTimes(1)
    const [id, until] = vi.mocked(api.snoozeTask).mock.calls[0]!
    expect(id).toBe('task-1')
    // Should be approximately 1 hour from now
    expect(until.getTime()).toBeGreaterThan(Date.now() + 3500000)
    expect(until.getTime()).toBeLessThan(Date.now() + 3700000)
  })

  it('shows Clear Snooze button and datetime when task is snoozed', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask({ snoozedUntil: futureDate }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    expect(await screen.findByText('Clear Snooze')).toBeDefined()
  })

  it('calls wakeTask when Clear Snooze is clicked', async () => {
    const user = userEvent.setup()
    const futureDate = new Date(Date.now() + 86400000).toISOString()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask({ snoozedUntil: futureDate }))
    vi.spyOn(api, 'wakeTask').mockResolvedValue(makeTask({ snoozedUntil: null }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    await user.click(await screen.findByText('Clear Snooze'))

    expect(api.wakeTask).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.wakeTask).mock.calls[0]![0]).toBe('task-1')
  })

  it('does not show Clear Snooze for an expired snooze', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString()
    vi.spyOn(api, 'fetchTask').mockResolvedValue(makeTask({ snoozedUntil: pastDate }))

    renderWithQuery(<TaskDetailPage taskId="task-1" onBack={onBack} />)

    // Expired snooze should show 1 Hour button, not Clear Snooze
    expect(await screen.findByText('1 Hour')).toBeDefined()
    expect(screen.queryByText('Clear Snooze')).toBeNull()
  })
})

describe('TaskDetailPage — queue toggle', () => {
  const onBack = vi.fn()

  function getTodoRadio() {
    return screen.getByRole('radio', { name: 'To Do' })
  }
  function getBacklogRadio() {
    return screen.getByRole('radio', { name: 'Backlog' })
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    onBack.mockReset()
  })

  it('has To Do selected for a todo task', async () => {
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

  it('new task via + Task has To Do selected', () => {
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
