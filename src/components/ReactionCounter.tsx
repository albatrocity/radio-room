import React, { memo, useContext, useEffect } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { groupBy } from "lodash/fp"
import { GrFormAdd, GrEmoji } from "react-icons/gr"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverBody,
  IconButton,
  Icon,
  Box,
  Wrap,
  WrapItem,
  Hide,
} from "@chakra-ui/react"

import { reactionsMachine } from "../machines/reactionsMachine"
import ReactionCounterItem from "./ReactionCounterItem"
import ReactionPicker from "./ReactionPicker"
import { GlobalStateContext } from "../contexts/global"
import { AuthContext } from "../machines/authMachine"
import { EmojiData } from "emoji-mart"
import { ReactionSubject } from "../types/ReactionSubject"
import { useAllReactions } from "../lib/useAllReactions"

interface ReactionAddButtonProps {
  onOpenPicker: ({ reactTo }: { reactTo: {} }) => void
  reactTo: ReactionSubject
  iconColor: string
  iconHoverColor?: string
  buttonColor?: string
  disabled?: boolean
}

const currentUserSelector = (state: { context: AuthContext }) =>
  state.context.currentUser

interface ReactionCounterProps extends ReactionAddButtonProps {
  showAddButton: boolean
  onReactionClick: (emoji: EmojiData) => void
}

const ReactionCounter = ({
  reactTo,
  buttonColor,
  showAddButton,
}: ReactionCounterProps) => {
  const globalServices = useContext(GlobalStateContext)
  const currentUser = useSelector(
    globalServices.authService,
    currentUserSelector,
  )
  const allReactions = useAllReactions()

  const [state, send] = useMachine(reactionsMachine, {
    context: {
      dropRef: null,
      reactTo,
      currentUser,
      reactions: allReactions[reactTo.type][reactTo.id],
    },
  })

  useEffect(() => {
    send("SET_REACT_TO", {
      data: { reactTo, reactions: allReactions },
    })
  }, [reactTo])

  const emoji = groupBy("emoji", state.context.reactions)

  return (
    <Box position="relative">
      {Object.keys(emoji).length > 0 && (
        <Wrap py={1}>
          {Object.keys(emoji)
            .filter((x) => !!emoji[x].length)
            .map((x) => (
              <WrapItem key={x}>
                <ReactionCounterItem
                  count={emoji[x].length}
                  users={emoji[x].map(({ user }) => user)}
                  currentUserId={currentUser.userId}
                  onReactionClick={(emoji) => {
                    send("SELECT_REACTION", { data: emoji })
                  }}
                  emoji={x}
                  color={buttonColor}
                />
              </WrapItem>
            ))}
          <WrapItem></WrapItem>
        </Wrap>
      )}
      <Popover
        isOpen={state.matches("open")}
        onClose={() => send("CLOSE")}
        placement="top-start"
      >
        <PopoverTrigger>
          <IconButton
            p={1}
            bg="transparent"
            aria-label="Add reaction"
            size="sm"
            disabled={!showAddButton}
            color={buttonColor}
            onClick={() => send("TOGGLE", { data: { reactTo } })}
            icon={
              <>
                <Icon as={GrEmoji} size={2} />
                <Hide below="md">
                  <Icon as={GrFormAdd} size={2} />
                </Hide>
              </>
            }
          />
        </PopoverTrigger>
        <PopoverContent>
          <PopoverArrow />
          <PopoverBody
            sx={{
              "em-emoji-picker": {
                "--shadow": "0",
              },
            }}
          >
            <ReactionPicker
              onSelect={(emoji: EmojiData) => {
                send("SELECT_REACTION", { data: emoji })
              }}
            />
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </Box>
  )
}

export default memo(ReactionCounter)
