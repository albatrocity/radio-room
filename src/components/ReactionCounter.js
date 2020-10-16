import React, { useRef, memo, useContext, useState } from "react"
import { Box, Button, ResponsiveContext } from "grommet"
import { groupBy, map, keys } from "lodash/fp"
import { FormAdd, Emoji as EmojiIcon } from "grommet-icons"

import ReactionCounterItem from "./ReactionCounterItem"

const ReactionAddButton = ({
  onOpenPicker,
  reactTo,
  iconColor,
  iconHoverColor,
  buttonColor,
  isMobile,
  disabled = false,
}) => {
  const ref = useRef()
  const [hovered, setHovered] = useState(false)
  return (
    <Button
      size="small"
      disabled={disabled}
      ref={ref}
      color={buttonColor}
      onClick={() => onOpenPicker(ref, reactTo)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      icon={
        <>
          <EmojiIcon
            color={hovered ? iconHoverColor : iconColor}
            size="small"
          />
          {!isMobile && (
            <FormAdd
              color={hovered ? iconHoverColor : iconColor}
              size="small"
            />
          )}
        </>
      }
    />
  )
}

const ReactionCounter = ({
  reactions,
  onOpenPicker,
  reactTo,
  onReactionClick,
  buttonColor,
  iconColor,
  iconHoverColor,
  showAddButton,
}) => {
  const emoji = groupBy("emoji", reactions)
  const size = useContext(ResponsiveContext)
  const isMobile = size === "small"
  return (
    <Box direction="row" wrap={false} gap="xsmall" align="center">
      <Box
        direction="row"
        wrap={!isMobile}
        flex={isMobile ? { grow: 1, shrink: 1 } : undefined}
      >
        <Box
          overflow={
            isMobile ? { horizontal: "auto", vertical: "hidden" } : "hidden"
          }
          gap="xsmall"
          wrap={!isMobile}
          align="center"
          direction="row"
        >
          {keys(emoji).map(x => (
            <ReactionCounterItem
              key={x}
              count={emoji[x].length}
              users={map("user", emoji[x])}
              onReactionClick={onReactionClick}
              reactTo={reactTo}
              emoji={x}
              color={buttonColor}
            />
          ))}
        </Box>
      </Box>

      <Box flex={{ shrink: 1, grow: 0 }}>
        <ReactionAddButton
          onOpenPicker={onOpenPicker}
          reactTo={reactTo}
          buttonColor={buttonColor}
          iconColor={showAddButton ? iconColor : "transparent"}
          disabled={!showAddButton}
          isMobile={isMobile}
          iconHoverColor={iconHoverColor}
        />
      </Box>
    </Box>
  )
}

export default memo(ReactionCounter)
