import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'

import { startAppHeightSync } from './lib/syncAppHeight'
// Howler HTML5 CORS for track preview / SFX (radio uses its own element — ADR 0140).
import { ensureHowlerHtml5Cors } from './lib/howlerHtml5Cors'
ensureHowlerHtml5Cors()

import '@fontsource/caveat/600.css'
import '@fontsource/nunito/300.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/700.css'
import './components/layout.css'
import './styles/roomTransition.css'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

startAppHeightSync()

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  )
}

