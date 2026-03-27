import { createFileRoute, useNavigate } from "@tanstack/react-router"

import PageLayout from "../components/PageLayout"
import AdminLobby from "../components/Lobby/AdminLobby"
import AppToasts from "../components/AppToasts"
import { useOAuthCallback } from "../hooks/useOAuthCallback"
import { useAuthSend } from "../hooks/useActors"
import { authClient } from "@repo/auth/client"
import { useEffect } from "react"
import { Center, Spinner } from "@chakra-ui/react"

export const Route = createFileRoute("/admin")({
  component: AdminPage,
})

function AdminPage() {
  const authSend = useAuthSend()
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login", replace: true })
    }
  }, [isPending, session, navigate])

  useEffect(() => {
    authSend({ type: "GET_SESSION_USER" })
  }, [authSend])

  useOAuthCallback()

  if (isPending) {
    return (
      <PageLayout>
        <Center h="50vh">
          <Spinner size="xl" />
        </Center>
      </PageLayout>
    )
  }

  if (!session) {
    return null
  }

  return (
    <PageLayout>
      <AppToasts />
      <AdminLobby />
    </PageLayout>
  )
}
