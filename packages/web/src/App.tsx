import { useState } from 'react'
import { getToken } from './auth.ts'
import LoginPage from './pages/LoginPage.tsx'
import HomePage from './pages/HomePage.tsx'

function App() {
  const [loggedIn, setLoggedIn] = useState(() => getToken() !== null)

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-md min-h-screen flex flex-col bg-white">
        {loggedIn
          ? <HomePage onLogout={() => setLoggedIn(false)} />
          : <LoginPage onLogin={() => setLoggedIn(true)} />
        }
      </div>
    </div>
  )
}

export default App
