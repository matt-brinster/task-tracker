import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPage from './SettingsPage.tsx'

describe('SettingsPage', () => {
  const onBack = vi.fn()
  const onLogout = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    onBack.mockReset()
    onLogout.mockReset()
  })

  it('renders a back button and Logout button', () => {
    render(<SettingsPage onBack={onBack} onLogout={onLogout} />)
    expect(screen.getByRole('button', { name: 'Back' })).toBeDefined()
    expect(screen.getByText('Logout')).toBeDefined()
  })

  it('calls onBack when back is clicked', async () => {
    const user = userEvent.setup()
    render(<SettingsPage onBack={onBack} onLogout={onLogout} />)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('calls onLogout when Logout is clicked', async () => {
    const user = userEvent.setup()
    render(<SettingsPage onBack={onBack} onLogout={onLogout} />)
    await user.click(screen.getByText('Logout'))
    expect(onLogout).toHaveBeenCalled()
  })

  it('does not render the admin section when isAdmin is false', () => {
    render(<SettingsPage onBack={onBack} onLogout={onLogout} />)
    expect(screen.queryByText('Admin')).toBeNull()
    expect(screen.queryByLabelText('New user email')).toBeNull()
  })

  it('renders the admin section when isAdmin is true', () => {
    render(<SettingsPage onBack={onBack} onLogout={onLogout} isAdmin={true} />)
    expect(screen.getByText('Admin')).toBeDefined()
    expect(screen.getByLabelText('New user email')).toBeDefined()
  })
})
