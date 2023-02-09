import React, {
  memo,
  MutableRefObject,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useMachine, useSelector } from "@xstate/react"
import { groupBy } from "lodash/fp"
import { FiPlus, FiSmile } from "react-icons/fi"
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
  HStack,
  Portal,
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
  const pickerRef: MutableRefObject<HTMLDivElement | null> =
    useRef<HTMLDivElement | null>(null)
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
    <HStack w="100%" className="poo">
      <Wrap py={1}>
        {Object.keys(emoji)
          .filter((x) => !!emoji[x].length)
          .map((x) => (
            <WrapItem key={x} justifyContent="center" alignItems="center">
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
        <WrapItem>
          <Popover
            isLazy
            isOpen={state.matches("open")}
            onClose={() => send("CLOSE")}
            placement="top-start"
            variant="responsive"
            autoFocus={true}
            initialFocusRef={pickerRef}
          >
            <PopoverTrigger>
              <IconButton
                p={1}
                bg="transparent"
                aria-label="Add reaction"
                size="sm"
                disabled={!showAddButton}
                color={"action.500"}
                _hover={{
                  color: "baseBg",
                  background: "action.500",
                }}
                onClick={() => send("TOGGLE", { data: { reactTo } })}
                icon={
                  <>
                    <Icon as={FiSmile} />

                    <Icon boxSize={3} as={FiPlus} />
                  </>
                }
              />
            </PopoverTrigger>
            <Portal>
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
                    ref={pickerRef}
                  />
                </PopoverBody>
              </PopoverContent>
            </Portal>
          </Popover>
        </WrapItem>
      </Wrap>
    </HStack>
  )
}

export default memo(ReactionCounter)
