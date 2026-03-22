import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { setToken } from './auth.ts'
import * as api from './api.ts'

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('App auth guard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('shows login page when no token exists', () => {
    renderWithQuery(<App />)

    expect(screen.getByLabelText('Invitation Key')).toBeDefined()
  })

  it('shows task list when token exists', async () => {
    setToken('valid-token')
    vi.spyOn(api, 'fetchOpenTasks').mockResolvedValue([])

    renderWithQuery(<App />)

    expect(await screen.findByText('+ Task')).toBeDefined()
  })
})
