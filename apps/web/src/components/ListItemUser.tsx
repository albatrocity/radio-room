import React, { memo } from "react"
import { get, isEqual } from "lodash/fp"

import { Box, Text, HStack, IconButton, Icon, List, VStack, Stack } from "@chakra-ui/react"
import { Tooltip } from "./ui/tooltip"
import { LuPencil, LuX } from "react-icons/lu"
import { FiMic, FiMusic, FiEye, FiHeadphones } from "react-icons/fi"
import { BiMessageRoundedDots, BiCrown } from "react-icons/bi"
import { User } from "../types/User"
import { PluginArea } from "./PluginComponents"

const statusIcon = (user: User) => {
  if (user.isDj) {
    return <Icon as={FiMic} boxSize={3} />
  }
  switch (user.status) {
    case "participating":
      return (
        <Tooltip content="Spectating" positioning={{ placement: "top" }}>
          <Box>
            <Icon opacity={0.5} _hover={{ opacity: 1 }} as={FiEye} boxSize={3} />
          </Box>
        </Tooltip>
      )
    case "listening":
      return (
        <Tooltip content="Listening" positioning={{ placement: "top" }}>
          <Box>
            <Icon opacity={0.5} _hover={{ opacity: 1 }} as={FiHeadphones} boxSize={3} />
          </Box>
        </Tooltip>
      )
  }
}

interface ListItemUserProps {
  user: User
  currentUser?: User
  onEditUser: (user: User) => void
  onKickUser?: (userId: string) => void
  onDeputizeDj?: (userId: string) => void
  showStatus?: boolean
  userTyping: boolean
  isAdmin?: boolean
}

const ListItemUser = ({
  user,
  currentUser,
  onEditUser,
  onKickUser,
  onDeputizeDj,
  userTyping,
  showStatus = true,
  isAdmin = false,
}: ListItemUserProps) => {
  return (
    <List.Item
      key={user.userId}
      flexDirection="row"
      display="flex"
      alignItems="center"
      background={user.isDj ? "primaryBg" : "transparent"}
    >
      <Box opacity={userTyping ? 1 : 0} transition="opacity 0.6s ease-in-out">
        <Box
          animation={userTyping ? "pulse 0.8s infinite ease-in-out" : undefined}
          transform="scaleX(-1)"
          left="-10px"
        >
          <Icon as={BiMessageRoundedDots} color="action.300" mr={1} />
        </Box>
      </Box>
      <VStack gap={1} align="start" w="100%">
        <HStack
          alignItems="center"
          borderBottomWidth="1px"
          gap="0.4rem"
          py={user.isDj ? 2 : 0}
          width="100%"
          justifyContent="space-between"
        >
          <HStack gap="0.4rem" justifyContent="flex-start">
            {showStatus && statusIcon(user)}
            {isAdmin && <Icon as={BiCrown} boxSize={3} />}
            <PluginArea
              area="userListItem"
              itemContext={{
                userId: user.userId,
                isDeputyDj: user.isDeputyDj,
                isDj: user.isDj,
                isAdmin: user.isAdmin,
              }}
              direction="row"
              spacing={1}
            />
            <Box>
              <Text fontWeight={user.isDj ? 700 : 500} fontSize="sm" lineClamp={2}>
                {user.username || "anonymous"}
              </Text>
            </Box>
          </HStack>
          <HStack gap="0.4rem">
            {user.userId === get("userId", currentUser) && (
              <IconButton
                variant="plain"
                aria-label="Edit Username"
                onClick={() => {
                  onEditUser(user)
                }}
                size="xs"
              >
                <LuPencil />
              </IconButton>
            )}
            {currentUser?.isAdmin && !isEqual(user?.userId, currentUser?.userId) && (
              <Tooltip
                positioning={{ placement: "top" }}
                content={user.isDeputyDj ? "Remove DJ privileges" : "Deputize DJ"}
              >
                <IconButton
                  size="xs"
                  variant={user.isDeputyDj ? "subtle" : "ghost"}
                  aria-label="Deputize DJ"
                  onClick={() => {
                    onDeputizeDj?.(user.userId)
                  }}
                >
                  <Icon as={FiMusic} />
                </IconButton>
              </Tooltip>
            )}
            {currentUser?.isAdmin && !isEqual(user?.userId, currentUser?.userId) && (
              <IconButton
                size="xs"
                variant="ghost"
                aria-label="Kick User"
                onClick={() => onKickUser?.(user.userId)}
              >
                <LuX />
              </IconButton>
            )}
          </HStack>
        </HStack>
      </VStack>
    </List.Item>
  )
}

// Custom comparison to ensure re-render when user properties change
function arePropsEqual(prevProps: ListItemUserProps, nextProps: ListItemUserProps): boolean {
  return (
    prevProps.user.userId === nextProps.user.userId &&
    prevProps.user.username === nextProps.user.username &&
    prevProps.user.isDj === nextProps.user.isDj &&
    prevProps.user.isDeputyDj === nextProps.user.isDeputyDj &&
    prevProps.user.isAdmin === nextProps.user.isAdmin &&
    prevProps.user.status === nextProps.user.status &&
    prevProps.currentUser?.userId === nextProps.currentUser?.userId &&
    prevProps.currentUser?.isAdmin === nextProps.currentUser?.isAdmin &&
    prevProps.userTyping === nextProps.userTyping &&
    prevProps.showStatus === nextProps.showStatus &&
    prevProps.isAdmin === nextProps.isAdmin
  )
}

export default memo(ListItemUser, arePropsEqual)
