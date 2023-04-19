import React, { memo, MutableRefObject, useEffect, useRef } from "react"
import { useMachine } from "@xstate/react"
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
  Wrap,
  WrapItem,
  HStack,
  Portal,
  ButtonProps,
  useBreakpointValue,
} from "@chakra-ui/react"
import { motion } from "framer-motion"

import { reactionsMachine } from "../machines/reactionsMachine"
import ReactionCounterItem from "./ReactionCounterItem"
import ReactionPicker from "./ReactionPicker"
import { EmojiData } from "emoji-mart"
import { ReactionSubject } from "../types/ReactionSubject"
import { useAllReactionsOf } from "../state/reactionsStore"

import { useCurrentUser } from "../state/authStore"

interface ReactionAddButtonProps {
  reactTo: ReactionSubject
  buttonVariant?: ButtonProps["variant"]
  buttonColorScheme?: ButtonProps["colorScheme"]
  disabled?: boolean
  showAddButton?: boolean
}

interface ReactionCounterProps extends ReactionAddButtonProps {
  showAddButton?: boolean
  darkBg?: boolean
}

const ReactionCounter = ({
  reactTo,
  buttonColorScheme,
  showAddButton = true,
  darkBg = false,
}: ReactionCounterProps) => {
  const pickerRef: MutableRefObject<HTMLDivElement | null> =
    useRef<HTMLDivElement | null>(null)

  const currentUser = useCurrentUser()
  const allReactions = useAllReactionsOf(reactTo.type, reactTo.id)

  const autoFocus = useBreakpointValue(
    {
      base: false,
      sm: false,
      md: true,
    },
    {
      fallback: "md",
    },
  )
  const responsivePickerRef = useBreakpointValue(
    {
      base: null,
      sm: null,
      md: pickerRef,
    },
    {
      fallback: "md",
    },
  )

  const [state, send] = useMachine(reactionsMachine, {
    context: {
      reactTo,
      currentUser,
      reactions: allReactions,
    },
  })

  useEffect(() => {
    send("SET_REACT_TO", {
      data: { reactTo, reactions: allReactions },
    })
  }, [reactTo])

  const emoji = groupBy("emoji", state.context.reactions)

  return (
    <HStack w="100%">
      <Wrap>
        {Object.keys(emoji)
          .filter((x) => !!emoji[x].length)
          .map((x) => (
            <WrapItem key={x} justifyContent="center" alignItems="center">
              <ReactionCounterItem
                count={emoji[x].length}
                users={emoji[x].map(({ user }) => user)}
                currentUserId={currentUser.userId}
                colorScheme={buttonColorScheme}
                onReactionClick={(emoji) => {
                  send("SELECT_REACTION", { data: emoji })
                }}
                emoji={x}
                darkBg={darkBg}
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
            initialFocusRef={responsivePickerRef}
          >
            <PopoverTrigger>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: showAddButton ? 1 : 0 }}
                transition={{ duration: 0.1 }}
              >
                <IconButton
                  p={1}
                  aria-label="Add reaction"
                  size="sm"
                  variant={darkBg ? "darkGhost" : "ghost"}
                  colorScheme={buttonColorScheme}
                  disabled={!showAddButton}
                  onClick={() => send("TOGGLE", { data: { reactTo } })}
                  icon={
                    <>
                      <Icon as={FiSmile} />

                      <Icon boxSize={3} as={FiPlus} />
                    </>
                  }
                />
              </motion.div>
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
                    autoFocus={autoFocus}
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
