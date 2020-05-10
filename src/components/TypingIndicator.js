import React, { useMemo } from "react"
import { tail, map, get, reject, last } from "lodash/fp"
import { Box, Text } from "grommet"

const TypingIndicator = ({ typing, currentUserId }) => {
  const typingUsers = useMemo(
    () =>
      map(u => get("username", u), reject({ userId: currentUserId }, typing)),
    [typing, currentUserId]
  )

  const formattedNames = useMemo(
    users => {
      const lastUser = last(typingUsers)
      if (typingUsers.length === 1) {
        return lastUser
      } else if (typingUsers.length > 2) {
        return "Several people"
      } else {
        return `${tail(typingUsers).join(", ")} and ${lastUser}`
      }
    },
    [typingUsers]
  )

  return (
    <Box
      style={{ opacity: typingUsers.length > 0 ? 1 : 0 }}
      pad={{ left: "40px", bottom: "small" }}
    >
      <Text size="small">
        {formattedNames} {typingUsers.length === 1 ? "is" : "are"} typing...
      </Text>
    </Box>
  )
}

TypingIndicator.displayName = "TypingIndicator"

export default TypingIndicator
