import { useActor } from "@xstate/react"
import useGlobalContext from "./useGlobalContext"

export default function useCanDj() {
  const globalServices = useGlobalContext()
  const [roomState] = useActor(globalServices.roomService)
  const isDeputyDj = roomState.matches("deputyDjaying.isDj")
  const isDj = roomState.matches("djaying")
  return isDeputyDj || isDj
}
