import { isNil } from "lodash/fp"
import { useStationMeta } from "../state/audioStore"
import { useAuthStore, useIsAuthenticated } from "../state/authStore"
import { useDjStore } from "../state/djStore"

export default function useCanDj() {
  const meta = useStationMeta()
  const accountIsPlaying = !isNil(meta?.title ?? meta?.track)
  const isDeputyDj = useDjStore((s) => s.state.matches("deputyDjaying"))
  const isDj = useDjStore((s) => s.state.matches("djaying"))
  const isAdmin = useAuthStore((s) => s.state.context.isAdmin)
  const isAuthenticated = useIsAuthenticated()

  return accountIsPlaying && isAuthenticated && (isDeputyDj || isDj || isAdmin)
}
