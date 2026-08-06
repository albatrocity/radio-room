import { memo, useCallback, useMemo, useState } from "react"
import { groupBy, find, isNil } from "lodash/fp"
import { useAllReactionsOf, useCurrentUser } from "../hooks/useActors"
import { emitToSocket } from "../actors/socketActor"
import ReactionSelection, { ReactionSelectionProps } from "./ReactionSelection"

import { ReactionSubject } from "../types/ReactionSubject"
import { Emoji } from "../types/Emoji"
import { Reaction } from "../types/Reaction"
import { User } from "../types/User"

type ReactionCounterProps = {
  reactTo: ReactionSubject
} & Partial<ReactionSelectionProps>

/** Toggle add/remove for a subject without a per-row XState machine. */
export function toggleReactionSelection(
  reactTo: ReactionSubject,
  emoji: Emoji,
  reactions: Reaction[],
  user: User,
): void {
  const existing = find({ user: user.userId, emoji: emoji.shortcodes }, reactions)
  if (isNil(existing)) {
    emitToSocket("ADD_REACTION", { emoji, reactTo, user })
  } else {
    emitToSocket("REMOVE_REACTION", { emoji, reactTo, user })
  }
}

const ReactionCounter = ({ reactTo, ...rest }: ReactionCounterProps) => {
  const currentUser = useCurrentUser()
  const allReactions = useAllReactionsOf(reactTo.type, reactTo.id)
  const [isOpen, setIsOpen] = useState(false)

  const emoji = useMemo(() => groupBy("emoji", allReactions), [allReactions])

  const handleSelection = useCallback(
    (selected: Emoji) => {
      if (!currentUser) return
      toggleReactionSelection(reactTo, selected, allReactions, currentUser)
      setIsOpen(false)
    },
    [allReactions, currentUser, reactTo],
  )

  const handleClose = useCallback(() => setIsOpen(false), [])

  const handleToggle = useCallback(() => setIsOpen((open) => !open), [])

  // Don't render until user is authenticated
  if (!currentUser) {
    return null
  }

  return (
    <ReactionSelection
      {...rest}
      onSelect={handleSelection}
      onClose={handleClose}
      reactions={emoji}
      user={currentUser}
      isOpen={isOpen}
      onToggle={handleToggle}
    />
  )
}

export default memo(ReactionCounter)
