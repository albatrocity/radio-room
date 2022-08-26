import React, { memo } from "react"
import { get, isEqual } from "lodash/fp"

import { Box, Text, Button } from "grommet"
import { Edit, MoreVertical, Microphone, Close } from "grommet-icons"
import { User } from "../types/User"

interface ListItemUserProps {
  user: User
  currentUser: User
  onEditUser: () => void
  onKickUser: (userId: string) => void
  userTyping: boolean
}

const ListItemUser = ({
  user,
  currentUser,
  onEditUser,
  onKickUser,
  userTyping,
}: ListItemUserProps) => {
  return (
    <Box key={user.userId}>
      <Box
        direction="row"
        align="center"
        justify="between"
        border={{ side: "bottom" }}
        gap="xsmall"
        pad={{ vertical: user.isDj ? "medium" : "small" }}
        elevation={user.isDj ? "small" : "none"}
        background={user.isDj ? "accent-2" : "transparent"}
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
              : undefined
          }
          style={{ opacity: userTyping ? 1 : 0 }}
        >
          <MoreVertical color="accent-3" size="small" />
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
          <Box pad={{ horizontal: "medium" }}>
            <Button
              plain
              onClick={() => onEditUser()}
              icon={<Edit size="small" />}
            />
          </Box>
        )}
        {get("isAdmin", currentUser) &&
          !isEqual(get("userId", user), get("userId", currentUser)) && (
            <Box pad={{ horizontal: "xsmall" }}>
              <Button
                plain
                onClick={() => onKickUser(user.userId)}
                icon={<Close size="small" />}
              />
            </Box>
          )}
      </Box>
    </Box>
  )
}

export default memo(ListItemUser)