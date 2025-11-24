import React from "react"
import { createFileRoute } from '@tanstack/react-router'

import PageLayout from "../components/PageLayout"
import Lobby from "../components/Lobby/Lobby"
import AppToasts from "../components/AppToasts"
import { useOAuthCallback } from "../hooks/useOAuthCallback"

export const Route = createFileRoute('/')({
  component: IndexPage,
})

function IndexPage() {
  // Handle OAuth callback redirects
  useOAuthCallback()
  
  return (
    <PageLayout>
      <AppToasts />
      <Lobby />
    </PageLayout>
  )
}

