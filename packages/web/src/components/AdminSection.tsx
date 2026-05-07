import { useState, type SubmitEvent } from 'react'
import { provisionUser, ApiError } from '../api.ts'

export default function AdminSection() {
  const [email, setEmail] = useState('')
  const [inviteKey, setInviteKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setInviteKey(null)
    setIsPending(true)
    try {
      const result = await provisionUser(email.trim())
      setInviteKey(result.invitationKey)
      setEmail('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('A user with that email already exists.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setIsPending(false)
    }
  }

  function handleCopy() {
    if (!inviteKey) return
    navigator.clipboard.writeText(inviteKey)
  }

  return (
    <div className="p-4 flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium text-gray-700" htmlFor="admin-email">
          New user email
        </label>
        <input
          id="admin-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          type="submit"
          disabled={isPending || email.trim() === ''}
          className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-700 disabled:bg-gray-300"
        >
          {isPending ? 'Creating…' : 'Create User'}
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>

      {inviteKey && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700" htmlFor="invite-key">
            Invite key
          </label>
          <div className="flex gap-2">
            <input
              id="invite-key"
              type="text"
              readOnly
              value={inviteKey}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50 font-mono"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 whitespace-nowrap"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
