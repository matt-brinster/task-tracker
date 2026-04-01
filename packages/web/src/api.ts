import { getToken, clearToken } from './auth.ts'
import type { TaskResponse } from './types.ts'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()

  const headers = new Headers(options.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  headers.set('Content-Type', 'application/json')

  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    clearToken()
    window.dispatchEvent(new Event('auth:logout'))
    throw new ApiError(401, 'Unauthorized')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' })) as { error: string }
    throw new ApiError(response.status, body.error)
  }

  return response
}

export async function fetchOpenTasks(): Promise<TaskResponse[]> {
  const response = await fetchApi('/tasks/open')
  return response.json() as Promise<TaskResponse[]>
}

export async function fetchActiveTasks(): Promise<TaskResponse[]> {
  const response = await fetchApi('/tasks/active')
  return response.json() as Promise<TaskResponse[]>
}

export async function archiveTasks(taskIds: string[]): Promise<{ archivedCount: number }> {
  const response = await fetchApi('/tasks/archive', {
    method: 'POST',
    body: JSON.stringify({ taskIds }),
  })
  return response.json() as Promise<{ archivedCount: number }>
}

export async function createTask(title: string, details: string = '', queue: 'todo' | 'backlog' = 'todo'): Promise<TaskResponse> {
  const response = await fetchApi('/tasks', {
    method: 'POST',
    body: JSON.stringify({ title, details, queue }),
  })
  return response.json() as Promise<TaskResponse>
}

export async function updateTask(id: string, fields: { title?: string; details?: string }): Promise<TaskResponse> {
  const response = await fetchApi(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
  return response.json() as Promise<TaskResponse>
}

export async function fetchTask(id: string): Promise<TaskResponse> {
  const response = await fetchApi(`/tasks/${id}`)
  return response.json() as Promise<TaskResponse>
}

export async function completeTask(id: string): Promise<TaskResponse> {
  const response = await fetchApi(`/tasks/${id}/complete`, { method: 'POST' })
  return response.json() as Promise<TaskResponse>
}

export async function reopenTask(id: string): Promise<TaskResponse> {
  const response = await fetchApi(`/tasks/${id}/reopen`, { method: 'POST' })
  return response.json() as Promise<TaskResponse>
}

export async function deleteTask(id: string): Promise<void> {
  await fetchApi(`/tasks/${id}`, { method: 'DELETE' })
}

export async function searchTasks(q: string, limit = 10): Promise<TaskResponse[]> {
  const response = await fetchApi(`/tasks/search?q=${encodeURIComponent(q)}&limit=${limit}`)
  return response.json() as Promise<TaskResponse[]>
}

export async function reorderTask(id: string, beforeId: string | null, afterId: string | null): Promise<TaskResponse> {
  const response = await fetchApi(`/tasks/${id}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ beforeId, afterId }),
  })
  return response.json() as Promise<TaskResponse>
}

export async function setQueue(id: string, queue: 'todo' | 'backlog'): Promise<TaskResponse> {
  const response = await fetchApi(`/tasks/${id}/queue`, {
    method: 'POST',
    body: JSON.stringify({ queue }),
  })
  return response.json() as Promise<TaskResponse>
}

export async function redeemInvitation(key: string): Promise<string> {
  const response = await fetch('/api/auth/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })

  if (!response.ok) {
    const body = await response.json() as { error: string }
    throw new ApiError(response.status, body.error)
  }

  const body = await response.json() as { token: string }
  return body.token
}
