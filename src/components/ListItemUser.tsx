import React, { memo } from "react"
import { get, isEqual } from "lodash/fp"
import { motion } from "framer-motion"

import {
  Box,
  Text,
  HStack,
  IconButton,
  Icon,
  ListItem,
  ListIcon,
} from "@chakra-ui/react"
import { EditIcon, SmallCloseIcon } from "@chakra-ui/icons"
import { GrMoreVertical, GrMicrophone } from "react-icons/gr"
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
    <ListItem
      key={user.userId}
      flexDirection="row"
      display="flex"
      alignItems="center"
    >
      <motion.div
        animate={{
          scale: [1, 1.1, 1.1, 1],
          opacity: userTyping ? [1, 0.9, 0.9, 1] : [0, 0, 0, 0],
        }}
        transition={{
          duration: 0.6,
          ease: "easeInOut",
          repeat: Infinity,
        }}
      >
        <ListIcon as={GrMoreVertical} color="gray.500" />
      </motion.div>
      <HStack
        align="center"
        justify="between"
        border={{ side: "bottom" }}
        gap="xsmall"
        py={user.isDj ? 4 : 0}
        background={user.isDj ? "accent-2" : "transparent"}
      >
        {user.isDj && <Icon as={GrMicrophone} />}
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
    </ListItem>
  )
}

export default memo(ListItemUser)
