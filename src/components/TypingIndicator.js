import React, { useMemo, useContext } from "react"
import { tail, map, get, reject, last } from "lodash/fp"
import { Box, Text } from "grommet"

import RoomContext from "../contexts/RoomContext"

const TypingIndicator = () => {
  const {
    state: { typing, currentUser },
  } = useContext(RoomContext)

  const typingUsers = useMemo(
    () =>
      map(
        u => get("username", u),
        reject({ userId: get("userId", currentUser) }, typing)
      ),
    [typing]
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
    <Box style={{ opacity: typingUsers.length > 0 ? 1 : 0 }}>
      <Text size="small">
        {formattedNames} {typingUsers.length === 1 ? "is" : "are"} typing...
      </Text>
    </Box>
  )
}

TypingIndicator.displayName = "TypingIndicator"

export default TypingIndicator
