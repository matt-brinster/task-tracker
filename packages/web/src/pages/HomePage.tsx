import { clearToken } from '../auth.ts'

export default function HomePage({ onLogout }: { onLogout: () => void }) {
  function handleLogout() {
    // TODO: logging out burns an invitation session — refactor backend or remove logout
    clearToken()
    onLogout()
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Tasks</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Log out
        </button>
      </header>
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <p>Your tasks will appear here.</p>
      </div>
    </div>
  )
}
