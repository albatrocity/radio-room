import React, { memo } from "react"
import { get, isEqual } from "lodash/fp"

import {
  Box,
  Text,
  HStack,
  IconButton,
  Icon,
  List,
  VStack,
  useSlotRecipe,
  Flex,
} from "@chakra-ui/react"
import { Tooltip } from "./ui/tooltip"
import {
  LuCrown,
  LuEye,
  LuHeadphones,
  LuMessageCircle,
  LuMic,
  LuMusic,
  LuPencil,
  LuX,
} from "react-icons/lu"
import { User } from "../types/User"
import { PluginArea } from "./PluginComponents"
import { listItemUserRecipe } from "../theme/listItemUserRecipe"
import { UserEffectBars } from "./UserEffectBars"

const statusIcon = (user: User) => {
  if (user.isDj) {
    return <Icon as={LuMic} boxSize={3} />
  }
  switch (user.status) {
    case "participating":
      return (
        <Tooltip content="Spectating" positioning={{ placement: "top" }}>
          <Box>
            <Icon opacity={0.5} _hover={{ opacity: 1 }} as={LuEye} boxSize={3} />
          </Box>
        </Tooltip>
      )
    case "listening":
      return (
        <Tooltip content="Listening" positioning={{ placement: "top" }}>
          <Box>
            <Icon opacity={0.5} _hover={{ opacity: 1 }} as={LuHeadphones} boxSize={3} />
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
  onDesignateAdmin?: (userId: string) => void
  showStatus?: boolean
  userTyping: boolean
  isAdmin?: boolean
  isRoomCreator?: boolean
}

const ListItemUser = ({
  user,
  currentUser,
  onEditUser,
  onKickUser,
  onDeputizeDj,
  onDesignateAdmin,
  userTyping,
  showStatus = true,
  isAdmin = false,
  isRoomCreator = false,
}: ListItemUserProps) => {
  const recipe = useSlotRecipe({ recipe: listItemUserRecipe })
  const styles = recipe({ isDj: user.isDj, isTyping: userTyping })

  return (
    <List.Item key={user.userId} css={styles.root} gap={1}>
      <Flex position="relative">
        <Box w="100%" h="100%" position="absolute" top={0} left={0} opacity={0.5}>
          <UserEffectBars tooltip={true} userId={user.userId} />
        </Box>
        <Box css={styles.typingIndicator}>
          <Box css={styles.typingIcon}>
            <Icon as={LuMessageCircle} color="action.300" boxSize={3} />
          </Box>
        </Box>
      </Flex>
      <VStack css={styles.content}>
        <HStack css={styles.row}>
          <HStack css={styles.leftGroup}>
            {showStatus && statusIcon(user)}
            {isRoomCreator && (
              <Tooltip content="Room Creator" positioning={{ placement: "top" }}>
                <Box>
                  <Icon as={LuCrown} boxSize={3} />
                </Box>
              </Tooltip>
            )}
            {isAdmin && !isRoomCreator && (
              <Tooltip content="Room Admin" positioning={{ placement: "top" }}>
                <Box>
                  <Icon as={LuCrown} boxSize={3} />
                </Box>
              </Tooltip>
            )}

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
              <Text css={styles.username} lineClamp={2}>
                {user.username || "anonymous"}
              </Text>
            </Box>
          </HStack>

          <HStack css={styles.actions}>
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
                  <Icon as={LuMusic} />
                </IconButton>
              </Tooltip>
            )}
            {onDesignateAdmin && !isEqual(user?.userId, currentUser?.userId) && (
              <Tooltip
                positioning={{ placement: "top" }}
                content={user.isAdmin ? "Remove admin privileges" : "Make admin"}
              >
                <IconButton
                  size="xs"
                  variant={user.isAdmin ? "subtle" : "ghost"}
                  aria-label="Designate Admin"
                  onClick={() => {
                    onDesignateAdmin(user.userId)
                  }}
                >
                  <Icon as={LuCrown} />
                </IconButton>
              </Tooltip>
            )}
            {currentUser?.isAdmin && !isEqual(user?.userId, currentUser?.userId) && !isAdmin && (
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
    prevProps.isAdmin === nextProps.isAdmin &&
    prevProps.isRoomCreator === nextProps.isRoomCreator
  )
}

export default memo(ListItemUser, arePropsEqual)
