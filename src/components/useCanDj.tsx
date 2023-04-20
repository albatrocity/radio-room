import { useAuthStore } from "../state/authStore"
import { useDjStore } from "../state/djStore"

export default function useCanDj() {
  const isDeputyDj = useDjStore((s) => s.state.matches("deputyDjaying"))
  const isDj = useDjStore((s) => s.state.matches("djaying"))
  const isAdmin = useAuthStore((s) => s.state.context.isAdmin)

  return isDeputyDj || isDj || isAdmin
}
