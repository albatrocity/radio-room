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
  Tooltip,
} from "@chakra-ui/react"
import { EditIcon, SmallCloseIcon } from "@chakra-ui/icons"
import { FiMic, FiMusic, FiEye, FiHeadphones } from "react-icons/fi"
import { BiMessageRoundedDots } from "react-icons/bi"
import { User } from "../types/User"

const statusIcon = (user: User) => {
  if (user.isDj) {
    return <Icon as={FiMic} boxSize={3} />
  }
  switch (user.status) {
    case "participating":
      return (
        <Tooltip hasArrow label="Spectating" placement="top">
          <Box>
            <Icon
              opacity={0.5}
              _hover={{ opacity: 1 }}
              as={FiEye}
              boxSize={3}
            />
          </Box>
        </Tooltip>
      )
    case "listening":
      return (
        <Tooltip hasArrow label="Listening" placement="top">
          <Box>
            <Icon
              opacity={0.5}
              _hover={{ opacity: 1 }}
              as={FiHeadphones}
              boxSize={3}
            />
          </Box>
        </Tooltip>
      )
  }
}

interface ListItemUserProps {
  user: User
  currentUser: User
  onEditUser: (user: User) => void
  onKickUser?: (userId: string) => void
  onDeputizeDj?: (userId: string) => void
  userTyping: boolean
}

const ListItemUser = ({
  user,
  currentUser,
  onEditUser,
  onKickUser,
  onDeputizeDj,
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
        initial={{ opacity: 0 }}
        animate={{
          opacity: userTyping ? 1 : 0,
        }}
        transition={{
          duration: 0.6,
          ease: "easeInOut",
        }}
      >
        <motion.div
          initial={{ x: -4 }}
          animate={{
            scale: userTyping ? [1, 0.9, 0.9, 1] : 1,
            scaleX: userTyping ? [-1, -0.9, -0.9, -1] : -1,
            x: [-4, -4, -4, -4],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Box left="-10px">
            <ListIcon as={BiMessageRoundedDots} color="action.300" />
          </Box>
        </motion.div>
      </motion.div>
      <HStack
        alignItems="center"
        justify="center"
        justifyContent="center"
        border={{ side: "bottom" }}
        gap="xsmall"
        py={user.isDj ? 2 : 0}
        width="100%"
      >
        {statusIcon(user)}
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
        {currentUser?.isAdmin &&
          !isEqual(user?.userId, currentUser?.userId) && (
            <IconButton
              size="xs"
              variant={user.isDeputyDj ? "solid" : "ghost"}
              aria-label="Deputize DJ"
              onClick={() => {
                onDeputizeDj?.(user.userId)
              }}
              icon={<Icon as={FiMusic} />}
            />
          )}
        {currentUser?.isAdmin &&
          !isEqual(user?.userId, currentUser?.userId) && (
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Kick User"
              onClick={() => onKickUser?.(user.userId)}
              icon={<SmallCloseIcon />}
            />
          )}
      </HStack>
    </ListItem>
  )
}

export default memo(ListItemUser)
