import { useLayoutEffect } from "react"
import { Outlet, createRootRoute } from "@tanstack/react-router"
import { Provider } from "../components/ui/provider"
import { dismissLaunchSplash } from "../lib/launchSplash"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  useLayoutEffect(() => {
    dismissLaunchSplash()
  }, [])

  return (
    <Provider>
      <Outlet />
    </Provider>
  )
}
