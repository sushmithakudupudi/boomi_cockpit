import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './components/auth/AuthContext'
import { LoginPage } from './components/auth/LoginPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider signInScreen={(props) => <LoginPage {...props} />}>
      <App />
    </AuthProvider>
  </StrictMode>,
)
