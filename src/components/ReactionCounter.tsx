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
import { GlobalStateContext } from "../contexts/global"
import { AuthContext } from "../machines/authMachine"
import { EmojiData } from "emoji-mart"
import { ReactionSubject } from "../types/ReactionSubject"
import { useAllReactions } from "../lib/useAllReactions"

interface ReactionAddButtonProps {
  onOpenPicker: ({ reactTo }: { reactTo: {} }) => void
  reactTo: ReactionSubject
  buttonVariant?: ButtonProps["variant"]
  buttonColorScheme?: ButtonProps["colorScheme"]
  disabled?: boolean
  showAddButton?: boolean
}

const currentUserSelector = (state: { context: AuthContext }) =>
  state.context.currentUser

interface ReactionCounterProps extends ReactionAddButtonProps {
  showAddButton: boolean
  onReactionClick: (emoji: EmojiData) => void
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
  const globalServices = useContext(GlobalStateContext)
  const currentUser = useSelector(
    globalServices.authService,
    currentUserSelector,
  )
  const allReactions = useAllReactions()
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
                  size="xs"
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
