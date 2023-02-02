import React, { memo, useContext } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { get, isEqual, find, reverse, reject } from "lodash/fp"
import { Box, Text, Heading, HStack } from "@chakra-ui/react"

import { typingMachine } from "../machines/typingMachine"
import ListItemUser from "./ListItemUser"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { GlobalStateContext } from "../contexts/global"
import { AuthContext } from "../machines/authMachine"

const currentUserSelector = (state: { context: AuthContext }) =>
  state.context.currentUser
const listenersSelector = (state) => state.context.listeners
const djSelector = (state) => state.context.dj

import { User } from "../types/User"
import { EditIcon } from "@chakra-ui/icons"

interface UserListProps {
  onEditUser: (user: {}) => void
  onEditSettings: () => void
  showHeading: boolean
}

const UserList = ({
  onEditUser,
  onEditSettings,
  showHeading = true,
}: UserListProps) => {
  const globalServices = useContext(GlobalStateContext)
  const [typingState] = useMachine(typingMachine)

  const currentUser = useSelector(
    globalServices.authService,
    currentUserSelector,
  )
  const listeners = useSelector(globalServices.usersService, listenersSelector)
  const dj = useSelector(globalServices.usersService, djSelector)

  const {
    context: { typing },
  } = typingState

  const currentDj = isEqual(get("userId", currentUser), get("userId", dj))
  const currentListener = find({ userId: currentUser.userId }, listeners)
  const isTyping = (user: User) => find({ userId: get("userId", user) }, typing)

  return (
    <Box gap={1}>
      {dj && (
        <Box margin={{ bottom: "small" }}>
          {showHeading && (
            <Heading as="h3" mb={0.5} mt={0}>
              DJ
            </Heading>
          )}
          <ListItemUser
            user={dj}
            currentUser={currentUser}
            onEditUser={onEditUser}
            userTyping={isTyping(dj)}
          />

          {currentDj && !dj.extraInfo && !dj.donationURL && (
            <Box background="accent-4" p={2}>
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
            <Box background="white" p={2}>
              {dj.extraInfo !== "" && (
                <Text>
                  <ParsedEmojiMessage content={dj.extraInfo} />
                </Text>
              )}
            </Box>
          )}
        </Box>
      )}
      <Box>
        {showHeading && (
          <Heading level={3} margin={{ bottom: "xsmall", top: "none" }}>
            Listeners <Text fontSize="sm">({listeners.length})</Text>
          </Heading>
        )}
        {currentListener && (
          <ListItemUser
            key={currentListener.userId}
            user={currentListener}
            userTyping={isTyping(currentUser.userId)}
            currentUser={currentUser}
            onEditUser={onEditUser}
            onKickUser={(_user: User) =>
              globalServices.authService.send("KICK_USER", currentListener)
            }
          />
        )}
        {reverse(reject({ userId: currentUser.userId }, listeners)).map((x) => {
          return (
            <ListItemUser
              key={x.userId}
              user={x}
              userTyping={isTyping(x)}
              currentUser={currentUser}
              onEditUser={onEditUser}
              onKickUser={(_user: User) =>
                globalServices.authService.send("KICK_USER", x)
              }
            />
          )
        })}
      </Box>
    </Box>
  )
}

export default memo(UserList)
