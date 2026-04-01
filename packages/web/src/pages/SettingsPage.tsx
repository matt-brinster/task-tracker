import BackButton from '../components/BackButton.tsx'
import { clearToken } from '../auth.ts'

type Props = {
  onBack: () => void
  onLogout: () => void
}

export default function SettingsPage({ onBack, onLogout }: Props) {
  function handleLogout() {
    clearToken()
    onLogout()
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <BackButton onClick={onBack} />
        <span className="font-medium text-gray-900">Settings</span>
        <div className="w-6" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <button
          onClick={handleLogout}
          className="w-full py-3 text-center text-gray-500 hover:text-gray-700"
        >
          Logout
        </button>
      </div>
    </div>
  )
}
