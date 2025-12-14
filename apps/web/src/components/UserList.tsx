import { memo, useCallback, useMemo } from "react"
import { get, find, reverse, reject } from "lodash/fp"
import { Box, Text, Heading, HStack, List, VStack } from "@chakra-ui/react"

import { typingMachine } from "../machines/typingMachine"
import { useSocketMachine } from "../hooks/useSocketMachine"
import ListItemUser from "./ListItemUser"
import {
  useCurrentUser,
  useAuthSend,
  useDj,
  useListeners,
  useAdminSend,
  useRoomCreator,
} from "../hooks/useActors"
import { PluginArea } from "./PluginComponents"

import { User } from "../types/User"

interface UserListProps {
  onEditUser: (user: User) => void
  showHeading?: boolean
  showStatus?: boolean
}

const UserList = ({ onEditUser, showHeading = true, showStatus = true }: UserListProps) => {
  const [typingState] = useSocketMachine(typingMachine)

  const authSend = useAuthSend()
  const adminSend = useAdminSend()
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
    (userId: User["userId"]) => authSend({ type: "KICK_USER", userId }),
    [authSend],
  )

  const handleDeputizeDj = useCallback(
    (userId: User["userId"]) => adminSend({ type: "DEPUTIZE_DJ", userId }),
    [adminSend],
  )

  // Memoize the filtered listeners list
  const otherListeners = useMemo(
    () => reverse(reject({ userId: currentUser?.userId }, listeners)),
    [listeners, currentUser?.userId],
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
          <List.Root w="100%">
            <ListItemUser
              user={dj}
              currentUser={currentUser}
              onEditUser={onEditUser}
              userTyping={isTyping(dj)}
            />
          </List.Root>
        </Box>
      )}
      <VStack gap={2} align="start" w="100%">
        {showHeading && (
          <HStack>
            <Heading as="h3" size="md">
              Listeners
            </Heading>
            <Text fontSize="xs">({listeners.length})</Text>
          </HStack>
        )}
        {/* Plugin components for user list area */}
        <PluginArea area="userList" direction="column" />
        <List.Root gap={1} w="100%">
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
        </List.Root>
      </VStack>
    </VStack>
  )
}

export default memo(UserList)
