import { useAuthStore, useIsAuthenticated } from "../state/authStore"
import { useDjStore } from "../state/djStore"

export default function useCanDj() {
  const isDeputyDj = useDjStore((s) => s.state.matches("deputyDjaying"))
  const isDj = useDjStore((s) => s.state.matches("djaying"))
  const isAdmin = useAuthStore((s) => s.state.context.isAdmin)
  const isAuthenticated = useIsAuthenticated()

  return isAuthenticated && (isDeputyDj || isDj || isAdmin)
}
