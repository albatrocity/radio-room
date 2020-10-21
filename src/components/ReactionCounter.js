import React, { useRef, memo, useContext, useEffect, useState } from "react"
import { useMachine, useService } from "@xstate/react"
import { Box, Button, ResponsiveContext, Drop } from "grommet"
import { groupBy, map, keys } from "lodash/fp"
import { FormAdd, Emoji as EmojiIcon } from "grommet-icons"

import { reactionsMachine } from "../machines/reactionsMachine"
import { dataService } from "../machines/dataMachine"
import AuthContext from "../contexts/AuthContext"
import { useTrackReactions } from "../contexts/useTrackReactions"
import ReactionCounterItem from "./ReactionCounterItem"
import ReactionPicker from "./ReactionPicker"

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
      onClick={() => onOpenPicker({ ref, reactTo })}
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
  reactTo,
  buttonColor,
  iconColor,
  iconHoverColor,
  showAddButton,
}) => {
  const [dataState] = useService(dataService)
  const [state, send] = useMachine(reactionsMachine, {
    context: {
      dropRef: null,
      reactTo,
      currentUser: dataState.context.currentUser,
      reactions: reactions,
    },
  })

  useEffect(() => {
    send("SET_REACT_TO", {
      data: { reactTo, reactions: dataState.context.reactions },
    })
  }, [reactTo])

  const emoji = groupBy("emoji", state.context.reactions)
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
              currentUserId={state.context.currentUser.userId}
              onReactionClick={emoji => {
                send("SELECT_REACTION", { data: emoji })
              }}
              reactTo={reactTo}
              emoji={x}
              color={buttonColor}
            />
          ))}
        </Box>
      </Box>

      <Box flex={{ shrink: 1, grow: 0 }}>
        <ReactionAddButton
          onOpenPicker={options => send("TOGGLE", { data: options })}
          reactTo={reactTo}
          buttonColor={buttonColor}
          iconColor={showAddButton ? iconColor : "transparent"}
          disabled={!showAddButton}
          isMobile={isMobile}
          iconHoverColor={iconHoverColor}
        />
      </Box>

      {state.matches("open") && (
        <Drop
          target={state.context.dropRef.current}
          plain
          overflow="visible"
          onClickOutside={() => send("TOGGLE")}
          onEsc={() => send("TOGGLE")}
          align={{ top: "top", right: "right" }}
        >
          <ReactionPicker
            onSelect={emoji => send("SELECT_REACTION", { data: emoji })}
          />
        </Drop>
      )}
    </Box>
  )
}

export default memo(ReactionCounter)
