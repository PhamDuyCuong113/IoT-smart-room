import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MockRoomProvider } from './data/MockRoomProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MockRoomProvider><App /></MockRoomProvider>
  </StrictMode>,
)
