import { Outlet, Navigate, createRootRoute, useRouterState } from "@tanstack/react-router"
import { Provider } from "../components/ui/provider"
import { useSession } from "@repo/auth/client"
import { Box, Spinner } from "@chakra-ui/react"
import { AppLayout } from "../components/layout/AppLayout"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const { data: session, isPending } = useSession()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isLoginRoute = pathname === "/login"
  const isAdmin = !!session && (session.user as any).role === "admin"

  if (isPending) {
    return (
      <Provider>
        <Box display="flex" alignItems="center" justifyContent="center" minH="100vh">
          <Spinner size="xl" />
        </Box>
      </Provider>
    )
  }

  if (isLoginRoute) {
    if (isAdmin) {
      return <Provider><Navigate to="/" /></Provider>
    }
    return <Provider><Outlet /></Provider>
  }

  if (!isAdmin) {
    return <Provider><Navigate to="/login" /></Provider>
  }

  return (
    <Provider>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </Provider>
  )
}
