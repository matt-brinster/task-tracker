import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  fetchApi, redeemInvitation, ApiError,
  fetchOpenTasks, fetchActiveTasks, archiveTasks, searchTasks,
  createTask, fetchTask, updateTask, completeTask, reopenTask, deleteTask,
} from './api.ts'
import { setToken, getToken } from './auth.ts'

const sampleTask = {
  id: 'task-1',
  title: 'Buy milk',
  details: '',
  queue: 'todo',
  completedAt: null,
  snoozedUntil: null,
  archivedAt: null,
  blockers: [],
}

describe('fetchApi', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('attaches the bearer token to requests', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await fetchApi('/tasks/open')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/open')
    const headers = options!.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-token')
  })

  it('sets Content-Type to application/json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await fetchApi('/tasks')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(fetch).mock.calls[0]!
    const headers = options!.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('does not attach Authorization when no token exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    )

    await fetchApi('/tasks')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(fetch).mock.calls[0]!
    const headers = options!.headers as Headers
    expect(headers.has('Authorization')).toBe(false)
  })

  it('clears token and dispatches auth:logout on 401', async () => {
    setToken('bad-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 401 })
    )
    const logoutHandler = vi.fn()
    window.addEventListener('auth:logout', logoutHandler)

    await expect(fetchApi('/tasks')).rejects.toThrow('Unauthorized')
    expect(getToken()).toBeNull()
    expect(logoutHandler).toHaveBeenCalledTimes(1)

    window.removeEventListener('auth:logout', logoutHandler)
  })
})

describe('fetchOpenTasks', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls GET /tasks/open and returns the task list', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([sampleTask]), { status: 200 })
    )

    const tasks = await fetchOpenTasks()

    expect(tasks).toEqual([sampleTask])
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/open')
    expect(options!.method).toBeUndefined()
  })
})

describe('fetchActiveTasks', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls GET /tasks/active and returns the task list', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([sampleTask]), { status: 200 })
    )

    const tasks = await fetchActiveTasks()

    expect(tasks).toEqual([sampleTask])
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/active')
    expect(options!.method).toBeUndefined()
  })
})

describe('archiveTasks', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls POST /tasks/archive with taskIds and returns the count', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ archivedCount: 2 }), { status: 200 })
    )

    const result = await archiveTasks(['task-1', 'task-2'])

    expect(result).toEqual({ archivedCount: 2 })
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/archive')
    expect(options!.method).toBe('POST')
    expect(JSON.parse(options!.body as string)).toEqual({ taskIds: ['task-1', 'task-2'] })
  })
})

describe('searchTasks', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls GET /tasks/search with encoded query and returns results', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([sampleTask]), { status: 200 })
    )

    const tasks = await searchTasks('buy milk')

    expect(tasks).toEqual([sampleTask])
    const [url] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/search?q=buy%20milk&limit=10')
  })

  it('encodes special characters in the query', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    )

    await searchTasks('foo & bar')

    const [url] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/search?q=foo%20%26%20bar&limit=10')
  })
})

describe('createTask', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls POST /tasks with title and details', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sampleTask), { status: 201 })
    )

    const task = await createTask('Buy milk', 'From the store')

    expect(task).toEqual(sampleTask)
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks')
    expect(options!.method).toBe('POST')
    expect(JSON.parse(options!.body as string)).toEqual({ title: 'Buy milk', details: 'From the store' })
  })

  it('defaults details to empty string', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sampleTask), { status: 201 })
    )

    await createTask('Buy milk')

    const [, options] = vi.mocked(fetch).mock.calls[0]!
    expect(JSON.parse(options!.body as string)).toEqual({ title: 'Buy milk', details: '' })
  })

  it('throws ApiError on non-ok response', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'title is required' }), { status: 400 })
    )

    try {
      await createTask('')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(400)
      expect((err as ApiError).message).toBe('title is required')
    }
  })
})

describe('fetchTask', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls GET /tasks/:id and returns the task', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sampleTask), { status: 200 })
    )

    const task = await fetchTask('task-1')

    expect(task).toEqual(sampleTask)
    const [url] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/task-1')
  })

  it('throws ApiError on 404', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Task not found' }), { status: 404 })
    )

    try {
      await fetchTask('nonexistent')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(404)
    }
  })
})

describe('completeTask', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls POST /tasks/:id/complete and returns updated task', async () => {
    setToken('test-token')
    const completed = { ...sampleTask, completedAt: '2026-03-20T00:00:00.000Z' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(completed), { status: 200 })
    )

    const task = await completeTask('task-1')

    expect(task.completedAt).toBe('2026-03-20T00:00:00.000Z')
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/task-1/complete')
    expect(options!.method).toBe('POST')
  })
})

describe('reopenTask', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls POST /tasks/:id/reopen and returns updated task', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sampleTask), { status: 200 })
    )

    const task = await reopenTask('task-1')

    expect(task.completedAt).toBeNull()
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/task-1/reopen')
    expect(options!.method).toBe('POST')
  })
})

describe('updateTask', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls PATCH /tasks/:id with fields and returns updated task', async () => {
    setToken('test-token')
    const updated = { ...sampleTask, title: 'Buy oat milk' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(updated), { status: 200 })
    )

    const task = await updateTask('task-1', { title: 'Buy oat milk' })

    expect(task.title).toBe('Buy oat milk')
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/task-1')
    expect(options!.method).toBe('PATCH')
    expect(JSON.parse(options!.body as string)).toEqual({ title: 'Buy oat milk' })
  })

  it('sends only the fields provided', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...sampleTask, details: 'updated details' }), { status: 200 })
    )

    await updateTask('task-1', { details: 'updated details' })

    const [, options] = vi.mocked(fetch).mock.calls[0]!
    expect(JSON.parse(options!.body as string)).toEqual({ details: 'updated details' })
  })
})

describe('deleteTask', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls DELETE /tasks/:id', async () => {
    setToken('test-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 })
    )

    await deleteTask('task-1')

    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/tasks/task-1')
    expect(options!.method).toBe('DELETE')
  })
})

describe('redeemInvitation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the token on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ token: 'session-token' }), { status: 201 })
    )

    const token = await redeemInvitation('invitation-key')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(token).toBe('session-token')
    const [url, options] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/auth/redeem')
    expect(JSON.parse(options!.body as string)).toEqual({ key: 'invitation-key' })
  })

  it('throws ApiError with server message on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid invitation key' }), { status: 401 })
    )

    try {
      await redeemInvitation('bad-key')
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(401)
      expect((err as ApiError).message).toBe('Invalid invitation key')
    }
  })
})
