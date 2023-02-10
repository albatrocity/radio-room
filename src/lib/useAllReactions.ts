import { useSelector } from "@xstate/react"
import { useContext } from "react"
import { GlobalStateContext } from "../contexts/global"
import { allReactionsSelector } from "../selectors/allReactionsSelector"

export function useAllReactions() {
  const globalServices = useContext(GlobalStateContext)
  const allReactions = useSelector(
    globalServices.allReactionsService,
    allReactionsSelector,
  )
  return allReactions
}
