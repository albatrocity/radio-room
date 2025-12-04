import React, { useMemo } from "react"
import { useMachine } from "@xstate/react"
import { take, map, get, reject, last } from "lodash/fp"
import { Box, Text } from "@chakra-ui/react"

import { User } from "../types/User"
import { typingMachine } from "../machines/typingMachine"

interface Props {
  currentUserId: User["userId"]
}

const TypingIndicator = ({ currentUserId }: Props) => {
  const [state] = useMachine(typingMachine)

  const {
    context: { typing },
  } = state

  const typingUsers = map(
    (u) => get("username", u),
    reject({ userId: currentUserId }, typing),
  )

  const formattedNames = useMemo(() => {
    const lastUser = last(typingUsers)
    if (typingUsers.length === 1) {
      return lastUser
    } else if (typingUsers.length > 4) {
      return "Several people"
    } else if (typingUsers.length === 0) {
      return "nobody"
    } else {
      return `${take(typingUsers.length - 1, typingUsers).join(
        ", ",
      )} and ${lastUser}`
    }
  }, [typingUsers])

  return (
    <Box
      opacity={typingUsers.length > 0 ? 1 : 0}
      transform={typingUsers.length > 0 ? "translateY(0)" : "translateY(100%)"}
      transition="opacity 0.1s, transform 0.1s"
      pl="40px"
      pb={1}
    >
      <Text fontSize="xs">
        {formattedNames}{" "}
        {typingUsers.length === 1 || typingUsers.length === 0 ? "is" : "are"}{" "}
        typing...
      </Text>
    </Box>
  )
}

TypingIndicator.displayName = "TypingIndicator"

export default TypingIndicator
