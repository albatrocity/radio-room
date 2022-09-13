import React, { memo, useContext, useEffect } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { groupBy, map, keys } from "lodash/fp"
import { FormAdd, Emoji as EmojiIcon } from "grommet-icons"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverBody,
  IconButton,
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
import { Reaction } from "../types/Reaction"

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
const reactionsSelector = (state) => state.context.reactions

interface ReactionCounterProps extends ReactionAddButtonProps {
  showAddButton: boolean
  reactions: Reaction[]
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
  const allReactions = useSelector(
    globalServices.allReactionsService,
    reactionsSelector,
  )

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
      <Wrap py={1}>
        {keys(emoji).map((x) => (
          <WrapItem key={x}>
            <ReactionCounterItem
              count={emoji[x].length}
              users={map("user", emoji[x])}
              currentUserId={currentUser.userId}
              onReactionClick={({ colons }) => {
                send("SELECT_REACTION", { data: colons })
              }}
              emoji={x}
              color={buttonColor}
            />
          </WrapItem>
        ))}
        <WrapItem></WrapItem>
      </Wrap>
      <Popover
        isOpen={state.matches("open")}
        onClose={() => send("TOGGLE")}
        placement="top-start"
      >
        <PopoverTrigger>
          <IconButton
            p={1}
            bg="transparent"
            aria-label="Add reaction"
            size="small"
            disabled={!showAddButton}
            color={buttonColor}
            onClick={() => send("TOGGLE", { data: { reactTo } })}
            icon={
              <>
                <EmojiIcon size="small" />
                <Hide below="md">
                  <FormAdd size="small" />
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
