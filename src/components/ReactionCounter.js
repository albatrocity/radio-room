import React, { useRef, memo, useContext } from "react"
import { Box, Button, ResponsiveContext } from "grommet"
import { groupBy, map, keys } from "lodash/fp"
import { FormAdd, Emoji as EmojiIcon } from "grommet-icons"

import ReactionCounterItem from "./ReactionCounterItem"

const ReactionAddButton = ({ onOpenPicker, reactTo, color, isMobile }) => {
  const ref = useRef()
  return (
    <Button
      hoverIndicator
      size="small"
      ref={ref}
      onClick={() => onOpenPicker(ref, reactTo)}
      round="xsmall"
      color={"black"}
      icon={
        <>
          <EmojiIcon size="small" />
          {!isMobile && <FormAdd size="small" />}
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
  color,
}) => {
  const emoji = groupBy("emoji", reactions)
  const size = useContext(ResponsiveContext)
  const isMobile = size === "small"
  return (
    <Box direction="row" wrap={false} gap="xsmall" align="center">
      <Box direction="row" wrap={!isMobile} flex={{ grow: 1, shrink: 1 }}>
        <Box
          overflow={isMobile ? "auto" : "hidden"}
          gap="xsmall"
          wrap={!isMobile}
          align="center"
          direction="row"
          justify="between"
        >
          {keys(emoji).map(x => (
            <ReactionCounterItem
              key={x}
              count={emoji[x].length}
              users={map("user", emoji[x])}
              onReactionClick={onReactionClick}
              reactTo={reactTo}
              emoji={x}
              color={color}
            />
          ))}
        </Box>
      </Box>
      <Box flex={{ shrink: 1, grow: 0 }}>
        <ReactionAddButton
          onOpenPicker={onOpenPicker}
          reactTo={reactTo}
          color={color}
          isMobile={isMobile}
        />
      </Box>
    </Box>
  )
}

export default memo(ReactionCounter)
