import React from "react"
import { createFileRoute } from "@tanstack/react-router"

import PageLayout from "../components/PageLayout"
import AdminLobby from "../components/Lobby/AdminLobby"
import AppToasts from "../components/AppToasts"
import { useOAuthCallback } from "../hooks/useOAuthCallback"

export const Route = createFileRoute("/admin")({
  component: AdminPage,
})

function AdminPage() {
  // Handle OAuth callback redirects
  useOAuthCallback()

  return (
    <PageLayout>
      <AppToasts />
      <AdminLobby />
    </PageLayout>
  )
}
