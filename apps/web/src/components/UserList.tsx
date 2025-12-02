import { memo, useCallback, useMemo } from "react"
import { useMachine } from "@xstate/react"
import { get, find, reverse, reject } from "lodash/fp"
import { Box, Text, Heading, HStack, List, VStack } from "@chakra-ui/react"

import { typingMachine } from "../machines/typingMachine"
import ListItemUser from "./ListItemUser"
import { useCurrentUser, useAuthStore } from "../state/authStore"
import { PluginArea } from "./PluginComponents"

import { User } from "../types/User"
import { useDj, useListeners } from "../state/usersStore"
import { useAdminStore } from "../state/adminStore"
import { useRoomCreator } from "../state/roomStore"

interface UserListProps {
  onEditUser: (user: User) => void
  showHeading?: boolean
  showStatus?: boolean
}

const UserList = ({ onEditUser, showHeading = true, showStatus = true }: UserListProps) => {
  const [typingState] = useMachine(typingMachine)

  const { send: authSend } = useAuthStore()
  const { send: adminSend } = useAdminStore()
  const currentUser = useCurrentUser()
  const listeners = useListeners()
  const creator = useRoomCreator()
  const dj = useDj()

  const {
    context: { typing },
  } = typingState

  const currentListener = find({ userId: currentUser.userId }, listeners)
  const isTyping = useCallback(
    (user: User) => !!find({ userId: get("userId", user) }, typing),
    [typing],
  )

  // Memoize stable callbacks
  const handleKickUser = useCallback(
    (userId: User["userId"]) => authSend("KICK_USER", { userId }),
    [authSend],
  )

  const handleDeputizeDj = useCallback(
    (userId: User["userId"]) => adminSend("DEPUTIZE_DJ", { userId }),
    [adminSend],
  )

  // Memoize the filtered listeners list
  const otherListeners = useMemo(
    () => reverse(reject({ userId: currentUser.userId }, listeners)),
    [listeners, currentUser.userId],
  )

  return (
    <VStack>
      {dj && (
        <Box mb={2} w="100%">
          {showHeading && (
            <Heading as="h3" size="md" mb={0.5} mt={0}>
              DJ
            </Heading>
          )}
          <List w="100%">
            <ListItemUser
              user={dj}
              currentUser={currentUser}
              onEditUser={onEditUser}
              userTyping={isTyping(dj)}
            />
          </List>
        </Box>
      )}
      <VStack spacing={2} align="start" w="100%">
        {showHeading && (
          <HStack>
            <Heading as="h3" size="md">
              Listeners
            </Heading>
            <Text fontSize="xs">({listeners.length})</Text>
          </HStack>
        )}
        {/* Plugin components for user list area */}
        <PluginArea area="userList" />
        <List spacing={1}>
          {currentListener && (
            <ListItemUser
              key={currentListener.userId}
              user={currentListener}
              isAdmin={currentListener.userId === creator}
              userTyping={isTyping(currentUser)}
              currentUser={currentUser}
              onEditUser={onEditUser}
              showStatus={showStatus}
            />
          )}
          {otherListeners.map((x) => (
            <ListItemUser
              key={x.userId}
              user={x}
              isAdmin={x.userId === creator}
              showStatus={showStatus}
              userTyping={isTyping(x)}
              currentUser={currentUser}
              onEditUser={onEditUser}
              onKickUser={handleKickUser}
              onDeputizeDj={handleDeputizeDj}
            />
          ))}
        </List>
      </VStack>
    </VStack>
  )
}

export default memo(UserList)
