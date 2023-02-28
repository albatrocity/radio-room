import { useActor, useSelector } from "@xstate/react"
import useGlobalContext from "./useGlobalContext"

export default function useCanDj() {
  const globalServices = useGlobalContext()
  const [roomState] = useActor(globalServices.roomService)
  const isDeputyDj = roomState.matches("deputyDjaying.isDj")
  const isDj = roomState.matches("djaying.isDj")
  const isAdmin = useSelector(
    globalServices.authService,
    (state) => state.context.isAdmin,
  )
  return isDeputyDj || isDj || isAdmin
}
