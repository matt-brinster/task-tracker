import { useState, useEffect } from 'react'
import { getToken } from './auth.ts'
import LoginPage from './pages/LoginPage.tsx'
import TaskListPage from './pages/TaskListPage.tsx'
import TaskDetailPage from './pages/TaskDetailPage.tsx'
import SearchPage from './pages/SearchPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'

import type { Queue } from './types.ts'

type View =
  | { page: 'list' }
  | { page: 'detail'; taskId: string | null; initialQueue?: Queue }
  | { page: 'search' }
  | { page: 'settings' }

function App() {
  const [loggedIn, setLoggedIn] = useState(() => getToken() !== null)
  const [view, setView] = useState<View>({ page: 'list' })

  useEffect(() => {
    const handleLogout = () => setLoggedIn(false)
    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [])

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="mx-auto max-w-md min-h-screen flex flex-col bg-white">
          <LoginPage onLogin={() => setLoggedIn(true)} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-md min-h-screen flex flex-col bg-white">
        {view.page === 'list' && (
          <TaskListPage
            onSettings={() => setView({ page: 'settings' })}
            onTaskClick={(taskId) => setView({ page: 'detail', taskId })}
            onNewTask={() => setView({ page: 'detail', taskId: null })}
            onNewBacklog={() => setView({ page: 'detail', taskId: null, initialQueue: 'backlog' })}
            onSearch={() => setView({ page: 'search' })}
          />
        )}
        {view.page === 'detail' && (
          <TaskDetailPage
            key={view.taskId}
            taskId={view.taskId}
            initialQueue={view.initialQueue}
            onBack={() => setView({ page: 'list' })}
          />
        )}
        {view.page === 'search' && (
          <SearchPage
            onBack={() => setView({ page: 'list' })}
            onTaskClick={(taskId) => setView({ page: 'detail', taskId })}
          />
        )}
        {view.page === 'settings' && (
          <SettingsPage
            onBack={() => setView({ page: 'list' })}
            onLogout={() => setLoggedIn(false)}
          />
        )}
      </div>
    </div>
  )
}

export default App
