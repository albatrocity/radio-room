import React, { useRef } from "react"
import { Box, Button } from "grommet"
import { groupBy, map, keys } from "lodash/fp"
import { FormAdd, Emoji } from "grommet-icons"

import ReactionCounterItem from "./ReactionCounterItem"

const ReactionAddButton = ({ onOpenPicker, reactTo }) => {
  const ref = useRef()
  return (
    <Button
      hoverIndicator
      ref={ref}
      onClick={() => onOpenPicker(ref, reactTo)}
      round="xsmall"
      icon={
        <>
          <Emoji size="small" />
          <FormAdd size="small" />
        </>
      }
    />
  )
}

const ReactionCounter = ({ reactions, onOpenPicker, reactTo }) => {
  const emoji = groupBy("emoji", reactions)
  return (
    <Box direction="row" wrap={true} gap="xsmall">
      {keys(emoji).map(x => (
        <ReactionCounterItem
          key={x}
          count={emoji[x].length}
          users={map("user", emoji[x])}
          emoji={x}
        />
      ))}
      <ReactionAddButton onOpenPicker={onOpenPicker} reactTo={reactTo} />
    </Box>
  )
}

export default ReactionCounter
