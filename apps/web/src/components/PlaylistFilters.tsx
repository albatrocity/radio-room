import React from "react"
import { Text, Wrap, useDisclosure } from "@chakra-ui/react"

import { useCurrentUser } from "../state/authStore"
import ReactionSelection from "./ReactionSelection"
import { Emoji } from "../types/Emoji"
import { Dictionary } from "../types/Dictionary"
import { Reaction } from "../types/Reaction"

type Props = {
  onChange: (emoji: Emoji) => void
  emojis: Dictionary<Reaction[]>
}

function PlaylistFilters({ onChange, emojis }: Props) {
  const currentUser = useCurrentUser()
  const { open, onToggle, onClose } = useDisclosure()

  return (
    <Wrap align="center">
      <Text>Filter by</Text>
      <ReactionSelection
        user={currentUser}
        reactions={emojis}
        isOpen={open}
        onSelect={onChange}
        onClose={onClose}
        onToggle={onToggle}
        showAddButton={true}
      />
    </Wrap>
  )
}

export default PlaylistFilters
