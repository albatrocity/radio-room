import { useSelector } from "@xstate/react"
import useGlobalContext from "./useGlobalContext"

import { useAuthStore } from "../state/authStore"

export default function useCanDj() {
  const globalServices = useGlobalContext()
  const isDeputyDj = useSelector(globalServices.roomService, (state) =>
    state.matches("deputyDjaying.isDj"),
  )
  const isDj = useSelector(globalServices.roomService, (state) =>
    state.matches("djaying.isDj"),
  )
  const isAdmin = useAuthStore((s) => s.state.context.isAdmin)
  return isDeputyDj || isDj || isAdmin
}
