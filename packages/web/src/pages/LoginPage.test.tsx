import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from './LoginPage.tsx'
import * as api from '../api.ts'
import { getToken } from '../auth.ts'

describe('LoginPage', () => {
  const onLogin = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    onLogin.mockReset()
  })

  it('renders the login form', () => {
    render(<LoginPage onLogin={onLogin} />)

    expect(screen.getByText('Task Tracker')).toBeDefined()
    expect(screen.getByLabelText('Invitation Key')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDefined()
  })

  it('disables the button when input is empty', () => {
    render(<LoginPage onLogin={onLogin} />)

    const button = screen.getByRole('button', { name: 'Sign In' })
    expect(button).toHaveProperty('disabled', true)
  })

  it('calls redeemInvitation and onLogin on success', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'redeemInvitation').mockResolvedValue('session-token')

    render(<LoginPage onLogin={onLogin} />)

    await user.type(screen.getByLabelText('Invitation Key'), 'my-key')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(api.redeemInvitation).toHaveBeenCalledWith('my-key')
    expect(getToken()).toBe('session-token')
    expect(onLogin).toHaveBeenCalled()
  })

  it('displays an error on failure', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'redeemInvitation').mockRejectedValue(
      new api.ApiError(401, 'Invalid invitation key')
    )

    render(<LoginPage onLogin={onLogin} />)

    await user.type(screen.getByLabelText('Invitation Key'), 'bad-key')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(screen.getByText('Invalid invitation key')).toBeDefined()
    expect(onLogin).not.toHaveBeenCalled()
  })
})
