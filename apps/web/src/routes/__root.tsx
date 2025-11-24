import React from 'react'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { ChakraProvider } from '@chakra-ui/react'
import customTheme from '../theme/chakraTheme'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <ChakraProvider theme={customTheme}>
      <Outlet />
    </ChakraProvider>
  )
}

