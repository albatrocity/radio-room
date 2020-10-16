import React, { useRef, memo } from "react"
import { Box, Button } from "grommet"
import { groupBy, map, keys } from "lodash/fp"
import { FormAdd, Emoji as EmojiIcon } from "grommet-icons"

import ReactionCounterItem from "./ReactionCounterItem"

const ReactionAddButton = ({ onOpenPicker, reactTo, color }) => {
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
          <FormAdd size="small" />
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
  return (
    <Box direction="row" wrap={true} gap="xsmall" align="center">
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
      <ReactionAddButton
        onOpenPicker={onOpenPicker}
        reactTo={reactTo}
        color={color}
      />
    </Box>
  )
}

export default memo(ReactionCounter)
