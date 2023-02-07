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
import { FiMoreVertical, FiMic } from "react-icons/fi"
import { User } from "../types/User"

interface ListItemUserProps {
  user: User
  currentUser: User
  onEditUser: (user: User) => void
  onKickUser?: (userId: string) => void
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
      background={user.isDj ? "primaryBg" : "transparent"}
    >
      <motion.div
        animate={{
          scale: [1, 0.8, 0.8, 1],
          opacity: userTyping ? [1, 0.9, 0.9, 1] : [0, 0, 0, 0],
        }}
        transition={{
          duration: 0.6,
          ease: "easeInOut",
          repeat: userTyping ? Infinity : 0,
        }}
      >
        <ListIcon as={FiMoreVertical} color="action.300" />
      </motion.div>
      <HStack
        align="center"
        justify="between"
        border={{ side: "bottom" }}
        gap="xsmall"
        py={user.isDj ? 2 : 0}
        width="100%"
      >
        {user.isDj && <Icon as={FiMic} boxSize={3} />}
        <Box>
          <Text fontWeight={user.isDj ? 700 : 500} fontSize="sm">
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
        {currentUser?.isAdmin && !isEqual(user?.userId, currentUser?.userId) && (
          <Box px="xs">
            <IconButton
              variant="link"
              aria-label="Kick User"
              onClick={() => onKickUser(user.userId)}
              icon={<SmallCloseIcon />}
            />
          </Box>
        )}
      </HStack>
    </ListItem>
  )
}

export default memo(ListItemUser)
