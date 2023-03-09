import { useSelector } from "@xstate/react"
import { useContext } from "react"
import { GlobalStateContext } from "../contexts/global"
import { ReactionSubject } from "../types/ReactionSubject"

const selector =
  (type: ReactionSubject["type"], id?: ReactionSubject["id"]) => (state) => {
    if (id) {
      return state.context.reactions[type][id]
    }
    return state.context.reactions[type]
  }

export function useAllReactions(
  type: ReactionSubject["type"],
  id?: ReactionSubject["id"],
) {
  const globalServices = useContext(GlobalStateContext)
  return useSelector(globalServices.allReactionsService, selector(type, id))
}
