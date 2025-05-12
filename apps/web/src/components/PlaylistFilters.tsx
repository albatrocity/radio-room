import React from "react"
import { Text, Wrap, WrapItem } from "@chakra-ui/react"
import { useDisclosure } from "@chakra-ui/hooks"

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
  const { isOpen, onToggle, onClose } = useDisclosure()

  return (
    <Wrap align="center">
      <WrapItem>
        <Text>Filter by</Text>
      </WrapItem>
      <WrapItem>
        <ReactionSelection
          user={currentUser}
          reactions={emojis}
          isOpen={isOpen}
          onSelect={onChange}
          onClose={onClose}
          onToggle={onToggle}
          showAddButton={true}
        />
      </WrapItem>
    </Wrap>
  )
}

export default PlaylistFilters
