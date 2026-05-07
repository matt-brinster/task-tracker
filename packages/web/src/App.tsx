import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getToken, clearToken } from './auth.ts'
import { fetchCurrentUser } from './api.ts'
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
  const queryClient = useQueryClient()
  const [loggedIn, setLoggedIn] = useState(() => getToken() !== null)
  const [view, setView] = useState<View>({ page: 'list' })

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: fetchCurrentUser,
    enabled: loggedIn,
  })

  const handleLogout = useCallback(() => {
    clearToken()
    queryClient.removeQueries({ queryKey: ['currentUser'] })
    setView({ page: 'list' })
    setLoggedIn(false)
  }, [queryClient])

  useEffect(() => {
    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [handleLogout])

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
            onLogout={handleLogout}
            isAdmin={currentUser?.isAdmin ?? false}
          />
        )}
      </div>
    </div>
  )
}

export default App
