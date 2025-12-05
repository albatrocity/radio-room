import { isNil } from "lodash/fp"
import {
  useStationMeta,
  useIsAuthenticated,
  useIsAdmin,
  useIsDjaying,
  useIsDeputyDjaying,
} from "../hooks/useActors"

export default function useCanDj() {
  const meta = useStationMeta()
  const accountIsPlaying = !isNil(meta?.title ?? meta?.track)
  const isDeputyDj = useIsDeputyDjaying()
  const isDj = useIsDjaying()
  const isAdmin = useIsAdmin()
  const isAuthenticated = useIsAuthenticated()

  return accountIsPlaying && isAuthenticated && (isDeputyDj || isDj || isAdmin)
}
