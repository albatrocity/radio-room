import React, { useContext, useRef, useState, memo } from "react"
import { Box, Text, Drop, Button } from "grommet"
import { Emoji } from "emoji-mart"
import { ThemeContext, ResponsiveContext } from "grommet"
import { map, get, find } from "lodash/fp"
import styled from "styled-components"

import { useUsers } from "../contexts/useUsers"
import AuthContext from "../contexts/AuthContext"

const ReactionCounterItem = ({
  count,
  users,
  emoji,
  onReactionClick,
  reactTo,
}) => {
  const theme = useContext(ThemeContext)
  const size = useContext(ResponsiveContext)
  const { state: authState } = useContext(AuthContext)
  const { state } = useUsers()
  const buttonRef = useRef()
  const [hovered, setHovered] = useState(false)
  const currentUserReaction =
    users.indexOf(authState.context.currentUser.userId) > -1
  const usernames = map(
    x => get("username", find({ userId: x }, state.users)),
    users
  )

  return (
    <>
      <Button
        direction="row"
        color="light-3"
        primary={currentUserReaction}
        gap="small"
        round="xsmall"
        align="center"
        justify="center"
        focusIndicator={false}
        onClick={() => onReactionClick({ reactTo, emoji: { colons: emoji } })}
        ref={buttonRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        size="small"
        icon={
          <Box height={theme.paragraph[size].size}>
            <Emoji
              size={parseInt(theme.paragraph[size].size.replace("px", ""))}
              emoji={emoji}
            />
          </Box>
        }
        label={
          <Text size="small" weight={700} style={{ lineHeight: "auto" }}>
            {count}
          </Text>
        }
      />
      {hovered && (
        <Drop target={buttonRef.current} align={{ bottom: "top" }}>
          <Box pad="small">
            <Text size="xsmall">{usernames.join(", ")}</Text>
          </Box>
        </Drop>
      )}
    </>
  )
}

export default memo(ReactionCounterItem)
