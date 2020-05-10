import React, { memo } from "react"
import { get, find } from "lodash/fp"

import { Box, Text, Button } from "grommet"
import { Edit, MoreVertical, Microphone } from "grommet-icons"

const ListItemUser = ({ user, currentUser, onEditUser, typing }) => {
  const userTyping = find({ userId: get("userId", user) }, typing)
  return (
    <Box key={user.userId}>
      <Box
        direction="row"
        align="center"
        justify="between"
        border={{ side: "bottom" }}
        gap="xsmall"
        pad={{ vertical: "xsmall" }}
        elevation={user.isDj ? "small" : "none"}
        background={user.isDj ? "dark-2" : "transparent"}
      >
        <Box
          animation={
            userTyping
              ? {
                  type: "pulse",
                  delay: 0,
                  duration: 200,
                  size: "large",
                }
              : null
          }
          style={{ opacity: userTyping ? 1 : 0 }}
        >
          <MoreVertical color="dark-4" size="small" />
        </Box>
        {user.isDj && (
          <Box>
            <Microphone size="14px" />
          </Box>
        )}
        <Box align="start" flex={{ grow: 1, shrink: 1 }}>
          <Text
            weight={user.isDj ? 700 : 500}
            size={user.isDj ? "medium" : "small"}
          >
            {user.username || "anonymous"}
          </Text>
        </Box>
        {user.userId === get("userId", currentUser) && (
          <Box pad={{ horizontal: "xsmall" }}>
            <Button
              plain
              onClick={() => onEditUser()}
              icon={<Edit size="small" />}
            />
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default memo(ListItemUser)
