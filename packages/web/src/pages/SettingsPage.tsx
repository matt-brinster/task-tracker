import BackButton from '../components/BackButton.tsx'
import SectionDivider from '../components/SectionDivider.tsx'
import AdminSection from '../components/AdminSection.tsx'

type Props = {
  onBack: () => void
  onLogout: () => void
  // Default to false so admin UI fails closed if a caller forgets to wire it up.
  isAdmin?: boolean
}

export default function SettingsPage({ onBack, onLogout, isAdmin = false }: Props) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <BackButton onClick={onBack} />
        <span className="font-medium text-gray-900">Settings</span>
        <div className="w-6" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <button
          onClick={onLogout}
          className="w-full py-3 text-center text-gray-500 hover:text-gray-700"
        >
          Logout
        </button>
        {isAdmin && (
          <>
            <SectionDivider label="Admin" />
            <AdminSection />
          </>
        )}
      </div>
    </div>
  )
}
