import React, { useContext, useRef, useState, memo } from "react"
import { Box, Text, Drop, Button } from "grommet"
import { Emoji } from "emoji-mart"
import { ThemeContext, ResponsiveContext } from "grommet"
import { map, get, find } from "lodash/fp"
import styled from "styled-components"

import ListUsernames from "./ListUsernames"

const ReactionCounterItem = ({
  count,
  users,
  emoji,
  onReactionClick,
  currentUserId,
  color = "light-2",
}) => {
  const theme = useContext(ThemeContext)
  const size = useContext(ResponsiveContext)
  const buttonRef = useRef()
  const [hovered, setHovered] = useState(false)
  const currentUserReaction = users.indexOf(currentUserId) > -1

  return (
    <>
      <Button
        direction="row"
        color={color}
        primary={currentUserReaction}
        gap="small"
        round="xsmall"
        align="center"
        justify="center"
        focusIndicator={false}
        onClick={() => onReactionClick({ colons: emoji })}
        ref={buttonRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        size="small"
        style={{ padding: "0.1rem 0.2rem" }}
        icon={
          <Box
            height={`${
              parseInt(theme.paragraph[size].size.replace("px", "")) + 4
            }px`}
          >
            <Emoji
              size={parseInt(theme.paragraph[size].size.replace("px", "")) + 4}
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
          <Box pad="small" width="small" align="center">
            <ListUsernames ids={users} />
          </Box>
        </Drop>
      )}
    </>
  )
}

export default memo(ReactionCounterItem)
