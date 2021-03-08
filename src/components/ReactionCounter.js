import React, { useRef, memo, useContext, useEffect, useState } from "react"
import { useMachine, useService } from "@xstate/react"
import { Box, Button, Layer, ResponsiveContext, Drop } from "grommet"
import { groupBy, map, keys } from "lodash/fp"
import { FormAdd, Close, Emoji as EmojiIcon } from "grommet-icons"

import { reactionsMachine } from "../machines/reactionsMachine"
import { useAuth } from "../contexts/useAuth"
import { useReactions } from "../contexts/useReactions"
import ReactionCounterItem from "./ReactionCounterItem"
import ReactionPicker from "./ReactionPicker"
import Modal from "./Modal"

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
      plain
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
  const [authState] = useAuth()
  const [reactionsState] = useReactions()
  const [state, send] = useMachine(reactionsMachine, {
    context: {
      dropRef: null,
      reactTo,
      currentUser: authState.context.currentUser,
      reactions: reactionsState.context.reactions[reactTo.type][reactTo.id],
    },
  })

  useEffect(() => {
    send("SET_REACT_TO", {
      data: { reactTo, reactions: reactionsState.context.reactions },
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
        <>
          {isMobile ? (
            <Layer
              responsive={false}
              onClose={() => send("TOGGLE")}
              onClickOutside={() => send("TOGGLE")}
              style={{ backgroundColor: "transparent" }}
            >
              <Box>
                <ReactionPicker
                  onSelect={emoji => send("SELECT_REACTION", { data: emoji })}
                />
              </Box>
            </Layer>
          ) : (
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
        </>
      )}
    </Box>
  )
}

export default memo(ReactionCounter)
