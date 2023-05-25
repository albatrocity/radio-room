import React, { MutableRefObject, useRef } from "react"
import {
  HStack,
  Wrap,
  WrapItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverBody,
  Portal,
  IconButton,
  Icon,
  useBreakpointValue,
  ButtonProps,
} from "@chakra-ui/react"
import { motion } from "framer-motion"
import { FiPlus, FiSmile } from "react-icons/fi"

import ReactionPicker from "./ReactionPicker"
import ReactionCounterItem from "./ReactionCounterItem"

import { User } from "../types/User"
import { Emoji } from "../types/Emoji"
import { Reaction } from "../types/Reaction"
import { Dictionary } from "../types/Dictionary"

export type ReactionSelectionProps = {
  reactions: Dictionary<Reaction[]>
  onSelect: (emoji: Emoji) => void
  onClose: () => void
  onToggle: () => void
  buttonVariant?: ButtonProps["variant"]
  buttonColorScheme?: ButtonProps["colorScheme"]
  disabled?: boolean
  showAddButton?: boolean
  scrollHorizontal?: boolean
  user: User
  isOpen?: boolean
  darkBg?: boolean
}

function ReactionSelection({
  onSelect,
  scrollHorizontal,
  reactions,
  user,
  buttonColorScheme,
  darkBg,
  isOpen = false,
  onClose,
  onToggle,
  showAddButton,
}: ReactionSelectionProps) {
  const pickerRef: MutableRefObject<HTMLDivElement | null> =
    useRef<HTMLDivElement | null>(null)
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
      base: undefined,
      sm: undefined,
      md: pickerRef,
    },
    {
      fallback: "md",
    },
  )

  return (
    <HStack w="100%">
      <Wrap flexShrink={scrollHorizontal ? 0 : 1}>
        {Object.keys(reactions)
          .filter((x) => !!reactions[x].length)
          .map((x) => (
            <WrapItem key={x} justifyContent="center" alignItems="center">
              <ReactionCounterItem
                count={reactions[x].length}
                users={reactions[x].map(({ user }: Reaction) => user)}
                currentUserId={user.userId}
                colorScheme={buttonColorScheme}
                onReactionClick={onSelect}
                emoji={x}
                darkBg={darkBg}
              />
            </WrapItem>
          ))}
        <WrapItem
          _last={{
            _after: {
              content: '""',
              paddingRight: 2,
            },
          }}
        >
          <Popover
            isLazy
            isOpen={isOpen}
            onClose={onClose}
            placement="top-start"
            variant="responsive"
            autoFocus={autoFocus}
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
                  onClick={() => onToggle()}
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
                    onSelect={onSelect}
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

export default ReactionSelection
