import React, { memo, useContext } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { Box, Text, Anchor, Heading } from "grommet"
import { get, isEqual, find, uniqBy, reverse, reject } from "lodash/fp"
import { Edit } from "grommet-icons"

import { typingMachine } from "../machines/typingMachine"
import ListItemUser from "./ListItemUser"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { GlobalStateContext } from "../contexts/global"

const currentUserSelector = (state) => state.context.currentUser
const listenersSelector = (state) => state.context.listeners
const djSelector = (state) => state.context.dj

const UserList = ({ onEditUser, onEditSettings, showHeading = true }) => {
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
  const isTyping = (user) => find({ userId: get("userId", user) }, typing)

  return (
    <Box gap="small">
      {dj && (
        <Box margin={{ bottom: "small" }}>
          {showHeading && (
            <Heading level={3} margin={{ bottom: "xsmall", top: "none" }}>
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
            <Box
              background="accent-4"
              pad="medium"
              elevation="medium"
              border={{ side: "all" }}
            >
              <Box
                margin="xsmall"
                pad="xsmall"
                direction="row"
                border={{ side: "all", style: "dashed" }}
                align="center"
                gap="xsmall"
                onClick={() => onEditSettings()}
              >
                <Text size="small">
                  Add info here, like links to anything you're promoting and a
                  donation link.
                </Text>
                <Edit />
              </Box>
            </Box>
          )}

          {dj.extraInfo && (
            <Box
              background="white"
              pad="medium"
              elevation="medium"
              border={{ side: "all" }}
            >
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
            Listeners <Text size="small">({listeners.length})</Text>
          </Heading>
        )}
        {currentListener && (
          <ListItemUser
            key={currentListener.userId}
            user={currentListener}
            userTyping={isTyping(currentUser.userId)}
            currentUser={currentUser}
            onEditUser={onEditUser}
            onKickUser={(user) => authSend("KICK_USER", currentListener)}
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
              onKickUser={(user) => authSend("KICK_USER", x)}
            />
          )
        })}
      </Box>
    </Box>
  )
}

export default memo(UserList)
