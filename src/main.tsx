import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Share pages are the only route that needs the 3D stack here; keep it out of every
// other page's initial download.
const SharedPanorama = lazy(() => import('./components/commercial/SharePanorama').then(module => ({ default: module.SharedPanorama })))

const sharedId = window.location.pathname.match(/(?:^|\/)s\/([a-f0-9]{32})\/?$/)?.[1];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{sharedId ? <SharedPanorama id={sharedId} /> : <App />}</Suspense>
  </StrictMode>,
)
