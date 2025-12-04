import { memo, useEffect, useCallback, useMemo } from "react"
import { useMachine } from "@xstate/react"
import { groupBy } from "lodash/fp"
import { reactionsMachine } from "../machines/reactionsMachine"
import { useAllReactionsOf } from "../state/reactionsStore"

import { useCurrentUser } from "../state/authStore"
import ReactionSelection, { ReactionSelectionProps } from "./ReactionSelection"

import { ReactionSubject } from "../types/ReactionSubject"
import { Emoji } from "../types/Emoji"

type ReactionCounterProps = {
  reactTo: ReactionSubject
} & Partial<ReactionSelectionProps>

const ReactionCounter = ({ reactTo, ...rest }: ReactionCounterProps) => {
  const currentUser = useCurrentUser()
  const allReactions = useAllReactionsOf(reactTo.type, reactTo.id)

  const [state, send] = useMachine(reactionsMachine, {
    context: {
      reactTo,
      currentUser,
      reactions: allReactions,
    },
  })

  useEffect(() => {
    send("SET_REACT_TO", {
      data: { reactTo, reactions: allReactions },
    })
  }, [reactTo, allReactions, send])

  const emoji = useMemo(() => groupBy("emoji", state.context.reactions), [state.context.reactions])

  const handleSelection = useCallback(
    (emoji: Emoji) => {
      send("SELECT_REACTION", { data: emoji })
    },
    [send],
  )

  const handleClose = useCallback(() => send("CLOSE"), [send])

  const handleToggle = useCallback(() => send("TOGGLE", { data: { reactTo } }), [send, reactTo])

  return (
    <ReactionSelection
      {...rest}
      onSelect={handleSelection}
      onClose={handleClose}
      reactions={emoji}
      user={currentUser}
      isOpen={state.matches("open")}
      onToggle={handleToggle}
    />
  )
}

export default memo(ReactionCounter)
