import { useSelector } from "@xstate/react"
import useGlobalContext from "./useGlobalContext"

export default function useCanDj() {
  const globalServices = useGlobalContext()
  const isDeputyDj = useSelector(globalServices.roomService, (state) =>
    state.matches("deputyDjaying.isDj"),
  )
  const isDj = useSelector(globalServices.roomService, (state) =>
    state.matches("djaying.isDj"),
  )
  const isAdmin = useSelector(
    globalServices.authService,
    (state) => state.context.isAdmin,
  )
  return isDeputyDj || isDj || isAdmin
}
