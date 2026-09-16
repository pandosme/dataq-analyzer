// import { StrictMode } from 'react' // Temporarily disabled - see below
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { UserPreferencesProvider } from './context/UserPreferencesContext.jsx'
import { WebSocketProvider } from './context/WebSocketContext.jsx'

createRoot(document.getElementById('root')).render(
  // Temporarily disabled StrictMode to prevent WebSocket interruption during development
  // TODO: Re-enable and handle double-mounting properly
  // <StrictMode>
    <MantineProvider
      defaultColorScheme="light"
      theme={{
        primaryColor: 'teal',
        defaultRadius: 'sm',
        fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
        headings: { fontFamily: '"Source Sans 3", "Segoe UI", sans-serif' },
      }}
    >
      <AuthProvider>
        <WebSocketProvider>
          <UserPreferencesProvider>
            <App />
          </UserPreferencesProvider>
        </WebSocketProvider>
      </AuthProvider>
    </MantineProvider>
  // </StrictMode>,
)
