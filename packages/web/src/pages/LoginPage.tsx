import { type SubmitEvent, useState } from 'react'
import { redeemInvitation, ApiError } from '../api.ts'
import { setToken } from '../auth.ts'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const token = await redeemInvitation(key.trim())
      setToken(token)
      onLogin()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <h1 className="text-2xl font-bold text-center">Task Tracker</h1>
        <div>
          <label htmlFor="key" className="block mb-1">Invitation Key</label>
          <input
            id="key"
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your invitation key"
            autoComplete="off"
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || key.trim() === ''}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
