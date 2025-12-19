import { useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"

import PageLayout from "../components/PageLayout"
import AdminLobby from "../components/Lobby/AdminLobby"
import AppToasts from "../components/AppToasts"
import { useOAuthCallback } from "../hooks/useOAuthCallback"
import { useAuthSend } from "../hooks/useActors"

export const Route = createFileRoute("/admin")({
  component: AdminPage,
})

function AdminPage() {
  const authSend = useAuthSend()

  // Check session on mount to restore auth state after page refresh/server restart
  useEffect(() => {
    authSend({ type: "GET_SESSION_USER" })
  }, [authSend])

  // Handle OAuth callback redirects
  useOAuthCallback()

  return (
    <PageLayout>
      <AppToasts />
      <AdminLobby />
    </PageLayout>
  )
}
