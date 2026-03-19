import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App.tsx'
import { setToken } from './auth.ts'

describe('App auth guard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows login page when no token exists', () => {
    render(<App />)

    expect(screen.getByLabelText('Invitation Key')).toBeDefined()
  })

  it('shows home page when token exists', () => {
    setToken('valid-token')

    render(<App />)

    expect(screen.getByText('Tasks')).toBeDefined()
  })
})
