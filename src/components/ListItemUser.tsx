import React, { memo } from "react"
import { get, isEqual } from "lodash/fp"

import { Box, Text, HStack, IconButton } from "@chakra-ui/react"
import { EditIcon, SmallCloseIcon } from "@chakra-ui/icons"
import { Edit, MoreVertical, Microphone } from "grommet-icons"
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
      <HStack
        align="center"
        justify="between"
        border={{ side: "bottom" }}
        gap="xsmall"
        py={user.isDj ? "medium" : "small"}
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
        <Box alignItems="start" flex={{ grow: 1, shrink: 1 }}>
          <Text
            fontWeight={user.isDj ? 700 : 500}
            fontSize={user.isDj ? "md" : "sm"}
          >
            {user.username || "anonymous"}
          </Text>
        </Box>
        {user.userId === get("userId", currentUser) && (
          <IconButton
            variant="link"
            aria-label="Edit Username"
            onClick={() => onEditUser()}
            size="xs"
            icon={<EditIcon />}
          />
        )}
        {get("isAdmin", currentUser) &&
          !isEqual(get("userId", user), get("userId", currentUser)) && (
            <Box px="xs">
              <IconButton
                variant="link"
                aria-label="Kick User"
                onClick={() => onKickUser(user.userId)}
                size="sm"
                icon={<SmallCloseIcon />}
              />
            </Box>
          )}
      </HStack>
    </Box>
  )
}

export default memo(ListItemUser)
