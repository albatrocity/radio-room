import React, { memo, useContext } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { get, isEqual, find, reverse, reject } from "lodash/fp"
import { Box, Text, Heading, HStack, List, VStack } from "@chakra-ui/react"

import { typingMachine } from "../machines/typingMachine"
import ListItemUser from "./ListItemUser"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { GlobalStateContext } from "../contexts/global"

import { useCurrentUser, useAuthStore } from "../state/authStore"

const listenersSelector = (state) => state.context.listeners
const djSelector = (state) => state.context.dj

import { User } from "../types/User"
import { EditIcon } from "@chakra-ui/icons"

interface UserListProps {
  onEditUser: (user: User) => void
  onEditSettings: () => void
  showHeading?: boolean
}

const UserList = ({
  onEditUser,
  onEditSettings,
  showHeading = true,
}: UserListProps) => {
  const globalServices = useContext(GlobalStateContext)
  const [typingState] = useMachine(typingMachine)

  const { send: authSend } = useAuthStore()
  const currentUser = useCurrentUser()
  const listeners = useSelector(globalServices.usersService, listenersSelector)
  const dj = useSelector(globalServices.usersService, djSelector)

  const {
    context: { typing },
  } = typingState

  const currentDj = isEqual(get("userId", currentUser), get("userId", dj))
  const currentListener = find({ userId: currentUser.userId }, listeners)
  const isTyping = (user: User) =>
    !!find({ userId: get("userId", user) }, typing)

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

          {currentDj && !dj.extraInfo && (
            <Box bg="appBg" p={2}>
              <HStack
                margin="xsmall"
                p={0.5}
                gap={0.5}
                onClick={() => onEditSettings()}
              >
                <Text fontSize="sm">
                  Add info here, like links to anything you're promoting and a
                  donation link.
                </Text>
                <EditIcon />
              </HStack>
            </Box>
          )}

          {dj.extraInfo && (
            <Box bg="appBg" p={2}>
              {dj.extraInfo !== "" && (
                <Text>
                  <ParsedEmojiMessage content={dj.extraInfo} />
                </Text>
              )}
            </Box>
          )}
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
        <List spacing={1}>
          {currentListener && (
            <ListItemUser
              key={currentListener.userId}
              user={currentListener}
              userTyping={isTyping(currentUser)}
              currentUser={currentUser}
              onEditUser={onEditUser}
            />
          )}
          {reverse(reject({ userId: currentUser.userId }, listeners)).map(
            (x) => {
              return (
                <ListItemUser
                  key={x.userId}
                  user={x}
                  userTyping={isTyping(x)}
                  currentUser={currentUser}
                  onEditUser={onEditUser}
                  onKickUser={(userId: User["userId"]) =>
                    authSend("KICK_USER", { userId })
                  }
                  onDeputizeDj={(userId: User["userId"]) => {
                    authSend("DEPUTIZE_DJ", { userId })
                  }}
                />
              )
            },
          )}
        </List>
      </VStack>
    </VStack>
  )
}

export default memo(UserList)
