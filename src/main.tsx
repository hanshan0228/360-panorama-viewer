import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SharedPanorama } from './components/commercial/SharePanorama'

const sharedId = window.location.pathname.match(/^\/s\/([a-f0-9]{32})\/?$/)?.[1];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {sharedId ? <SharedPanorama id={sharedId} /> : <App />}
  </StrictMode>,
)
