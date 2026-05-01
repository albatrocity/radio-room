import React, { useMemo } from "react"
import { take, map, get, reject, last } from "lodash/fp"
import { Box, Text } from "@chakra-ui/react"

import { User } from "../types/User"
import { typingMachine } from "../machines/typingMachine"
import { useSocketMachine } from "../hooks/useSocketMachine"

interface Props {
  currentUserId: User["userId"]
}

const TypingIndicator = ({ currentUserId }: Props) => {
  const [state] = useSocketMachine(typingMachine)

  const {
    context: { typing },
  } = state

  const typingUsers = map((u) => get("username", u), reject({ userId: currentUserId }, typing))

  const formattedNames = useMemo(() => {
    const lastUser = last(typingUsers)
    if (typingUsers.length === 1) {
      return lastUser
    } else if (typingUsers.length > 4) {
      return "Several people"
    } else if (typingUsers.length === 0) {
      return "nobody"
    } else {
      return `${take(typingUsers.length - 1, typingUsers).join(", ")} and ${lastUser}`
    }
  }, [typingUsers])

  const isActive = typingUsers.length > 0

  return (
    <Box
      opacity={0}
      transform="translateY(100%)"
      transition="opacity 0.1s, transform 0.1s"
      pl="40px"
      pb={1}
      data-active={isActive || undefined}
      css={{
        "&[data-active]": {
          opacity: 1,
          transform: "translateY(0)",
        },
      }}
    >
      <Text fontSize="xs">
        {formattedNames} {typingUsers.length === 1 || typingUsers.length === 0 ? "is" : "are"}{" "}
        typing...
      </Text>
    </Box>
  )
}

TypingIndicator.displayName = "TypingIndicator"

export default TypingIndicator
