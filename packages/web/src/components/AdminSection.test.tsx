import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminSection from './AdminSection.tsx'
import * as api from '../api.ts'

describe('AdminSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the form', () => {
    render(<AdminSection />)
    expect(screen.getByLabelText('New user email')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Create User' })).toBeDefined()
  })

  it('disables submit when email is empty', () => {
    render(<AdminSection />)
    expect(screen.getByRole('button', { name: 'Create User' })).toHaveProperty('disabled', true)
  })

  it('shows invite key and clears email on success', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'provisionUser').mockResolvedValue({
      userId: 'u1',
      email: 'new@example.com',
      invitationKey: 'abc123',
    })

    render(<AdminSection />)

    await user.type(screen.getByLabelText('New user email'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Create User' }))

    expect(api.provisionUser).toHaveBeenCalledWith('new@example.com')
    expect(screen.getByLabelText('Invite key')).toHaveProperty('value', 'abc123')
    expect(screen.getByLabelText('New user email')).toHaveProperty('value', '')
  })

  it('shows duplicate email error on 409', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'provisionUser').mockRejectedValue(new api.ApiError(409, 'Conflict'))

    render(<AdminSection />)

    await user.type(screen.getByLabelText('New user email'), 'existing@example.com')
    await user.click(screen.getByRole('button', { name: 'Create User' }))

    expect(screen.getByText('A user with that email already exists.')).toBeDefined()
    expect(screen.queryByLabelText('Invite key')).toBeNull()
  })

  it('shows generic error on other failures', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'provisionUser').mockRejectedValue(new api.ApiError(500, 'Server error'))

    render(<AdminSection />)

    await user.type(screen.getByLabelText('New user email'), 'test@example.com')
    await user.click(screen.getByRole('button', { name: 'Create User' }))

    expect(screen.getByText('Something went wrong. Please try again.')).toBeDefined()
  })

  it('clears previous invite key and error when submitting again', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'provisionUser')
      .mockResolvedValueOnce({ userId: 'u1', email: 'a@example.com', invitationKey: 'key1' })
      .mockResolvedValueOnce({ userId: 'u2', email: 'b@example.com', invitationKey: 'key2' })

    render(<AdminSection />)

    await user.type(screen.getByLabelText('New user email'), 'a@example.com')
    await user.click(screen.getByRole('button', { name: 'Create User' }))
    expect(screen.getByLabelText('Invite key')).toHaveProperty('value', 'key1')

    await user.type(screen.getByLabelText('New user email'), 'b@example.com')
    await user.click(screen.getByRole('button', { name: 'Create User' }))
    expect(screen.getByLabelText('Invite key')).toHaveProperty('value', 'key2')
  })
})
