import { useSelector } from "@xstate/react"
import { useContext, useMemo } from "react"
import { GlobalStateContext } from "../contexts/global"
import { ReactionSubject } from "../types/ReactionSubject"

export function useAllReactions(type: ReactionSubject["type"]) {
  const globalServices = useContext(GlobalStateContext)
  const selector = useMemo(
    () => (state) => state.context.reactions[type],
    [type],
  )
  return useSelector(globalServices.allReactionsService, selector)
}
