import React, { useContext, useMemo, memo } from "react"
import { useMachine } from "@xstate/react"
import { Box, Text, Anchor, Heading } from "grommet"
import Linkify from "react-linkify"
import { Currency } from "grommet-icons"
import styled from "styled-components"
import { get, isEqual, find, uniqBy } from "lodash/fp"
import { Edit } from "grommet-icons"

import { usersMachine } from "../machines/usersMachine"
import { typingMachine } from "../machines/typingMachine"
import ListItemUser from "./ListItemUser"
import ParsedEmojiMessage from "./ParsedEmojiMessage"

const StyledText = styled(Text)`
  a {
    color: ${p => p.theme.global.colors[p.theme.anchor.color.dark]};
  }
`

const componentDecorator = (href, text, key) => (
  <Anchor href={href} key={key} target="_blank" rel="noopener noreferrer">
    {text}
  </Anchor>
)

const UserList = ({ onEditUser, onEditSettings }) => {
  const [state, send] = useMachine(usersMachine)
  const [typingState] = useMachine(typingMachine)

  const {
    context: { listeners, dj, currentUser },
  } = state
  const {
    context: { typing },
  } = typingState

  const currentDj = isEqual(get("userId", currentUser), get("userId", dj))

  const isTyping = user => find({ userId: get("userId", user) }, typing)

  return (
    <Box gap="small">
      {dj && (
        <Box margin={{ bottom: "small" }}>
          <Heading level={3} margin={{ bottom: "xsmall", top: "none" }}>
            DJ
          </Heading>
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
        <Heading level={3} margin={{ bottom: "xsmall", top: "none" }}>
          Listeners <Text size="small">({listeners.length})</Text>
        </Heading>
        {listeners.map(x => {
          return (
            <ListItemUser
              key={x.userId}
              user={x}
              userTyping={isTyping(x)}
              currentUser={currentUser}
              onEditUser={onEditUser}
              onKickUser={user => send("KICK_USER", { user })}
            />
          )
        })}
      </Box>
    </Box>
  )
}

export default memo(UserList)
