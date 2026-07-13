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
  Menu,
  Portal,
} from "@chakra-ui/react"
import { Tooltip } from "./ui/tooltip"
import {
  LuCrown,
  LuEllipsisVertical,
  LuEye,
  LuHeadphones,
  LuMessageCircle,
  LuMic,
  LuMusic,
  LuPencil,
} from "react-icons/lu"
import type { AdminAssignablePersona } from "@repo/types"
import { User } from "../types/User"
import { PluginArea } from "./PluginComponents"
import { listItemUserRecipe } from "../theme/listItemUserRecipe"
import { UserEffectBars } from "./UserEffectBars"
import { getUserListPersonaBadges, userHasPersona } from "../lib/userPersonas"
import { PersonaBadge } from "./PersonaBadge"
import { getIcon } from "./PluginComponents/icons"

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
  assignablePersonas?: AdminAssignablePersona[]
  onTogglePersona?: (userId: string, personaId: string) => void
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
  assignablePersonas = [],
  onTogglePersona,
  userTyping,
  showStatus = true,
  isAdmin = false,
  isRoomCreator = false,
}: ListItemUserProps) => {
  const recipe = useSlotRecipe({ recipe: listItemUserRecipe })
  const styles = recipe({ isDj: user.isDj, isTyping: userTyping })
  const listPersonaBadges = getUserListPersonaBadges(user)
  const isSelf = user.userId === get("userId", currentUser)
  const showAdminMenu =
    !isSelf &&
    currentUser?.isAdmin &&
    (onKickUser || onDesignateAdmin || onTogglePersona || assignablePersonas.length > 0)

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
            {listPersonaBadges.map((persona) => (
              <PersonaBadge
                key={persona.personaId}
                persona={persona}
                color={persona.personaId === "vip" ? "yellow.400" : undefined}
              />
            ))}

            <Box>
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
            </Box>
          </HStack>

          <HStack css={styles.actions}>
            {isSelf && (
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
            {currentUser?.isAdmin && !isSelf && (
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
            {showAdminMenu && (
              <Menu.Root>
                <Menu.Trigger asChild>
                  <IconButton size="xs" variant="ghost" aria-label="User actions">
                    <Icon as={LuEllipsisVertical} />
                  </IconButton>
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content>
                      {onDesignateAdmin && (
                        <Menu.Item value="admin" onClick={() => onDesignateAdmin(user.userId)}>
                          <Icon as={LuCrown} boxSize={4} />
                          {user.isAdmin ? "Remove admin" : "Make admin"}
                        </Menu.Item>
                      )}
                      {onTogglePersona &&
                        assignablePersonas.map((def) => {
                          const has = userHasPersona(user, def.personaId)
                          const MenuIcon = getIcon(def.icon ?? "Star")
                          return (
                            <Menu.Item
                              key={def.personaId}
                              value={def.personaId}
                              color={has ? "fg.muted" : undefined}
                              onClick={() => onTogglePersona(user.userId, def.personaId)}
                            >
                              {MenuIcon ? <Icon as={MenuIcon} boxSize={4} /> : null}
                              {has ? `Remove ${def.label}` : `Make ${def.label}`}
                            </Menu.Item>
                          )
                        })}
                      {onKickUser && !isAdmin && (
                        <Menu.Item
                          value="kick"
                          color="fg.error"
                          onClick={() => onKickUser(user.userId)}
                        >
                          Kick
                        </Menu.Item>
                      )}
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            )}
          </HStack>
        </HStack>
      </VStack>
    </List.Item>
  )
}

function personasEqual(a?: User["personas"], b?: User["personas"]): boolean {
  if (a === b) return true
  if (!a || !b) return !a && !b
  if (a.length !== b.length) return false
  return a.every((p, i) => p.personaId === b[i]?.personaId)
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
    personasEqual(prevProps.user.personas, nextProps.user.personas) &&
    prevProps.currentUser?.userId === nextProps.currentUser?.userId &&
    prevProps.currentUser?.isAdmin === nextProps.currentUser?.isAdmin &&
    prevProps.userTyping === nextProps.userTyping &&
    prevProps.showStatus === nextProps.showStatus &&
    prevProps.isAdmin === nextProps.isAdmin &&
    prevProps.isRoomCreator === nextProps.isRoomCreator &&
    prevProps.onDesignateAdmin === nextProps.onDesignateAdmin &&
    prevProps.onTogglePersona === nextProps.onTogglePersona &&
    prevProps.assignablePersonas === nextProps.assignablePersonas
  )
}

export default memo(ListItemUser, arePropsEqual)
