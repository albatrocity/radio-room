import React from 'react'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Provider } from '../components/ui/provider'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <Provider>
      <Outlet />
    </Provider>
  )
}
