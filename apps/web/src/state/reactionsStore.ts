import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { allReactionsMachine } from "../machines/allReactionsMachine"

import { ReactionSubject } from "../types/ReactionSubject"

export const useAllReactionsStore = create(xstate(allReactionsMachine))

export function useAllReactions(
  type: ReactionSubject["type"],
  id?: ReactionSubject["id"],
) {
  return useAllReactionsStore((s) =>
    id
      ? s.state.context.reactions[type][id]
      : s.state.context.reactions[type] || [],
  )
}

export function useAllReactionsOf(
  type: ReactionSubject["type"],
  id: ReactionSubject["id"],
) {
  return useAllReactionsStore((s) => s.state.context.reactions[type][id])
}

export function useGetAllReactionsOf(type: ReactionSubject["type"]) {
  const reactions = useAllReactionsStore((s) => s.state.context.reactions[type])
  return (id: ReactionSubject["id"]) => reactions[id] || []
}
