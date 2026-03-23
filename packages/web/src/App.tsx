import { useState, useEffect } from 'react'
import { getToken } from './auth.ts'
import LoginPage from './pages/LoginPage.tsx'
import TaskListPage from './pages/TaskListPage.tsx'
import TaskDetailPage from './pages/TaskDetailPage.tsx'

type View =
  | { page: 'list' }
  | { page: 'detail'; taskId: string | null }

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
        {view.page === 'list' ? (
          <TaskListPage
            onLogout={() => setLoggedIn(false)}
            onTaskClick={(taskId) => setView({ page: 'detail', taskId })}
            onNewTask={() => setView({ page: 'detail', taskId: null })}
          />
        ) : (
          <TaskDetailPage
            taskId={view.taskId}
            onBack={() => setView({ page: 'list' })}
          />
        )}
      </div>
    </div>
  )
}

export default App
