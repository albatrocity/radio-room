import React, { MutableRefObject, useRef, memo, useMemo } from "react"
import {
  HStack,
  Wrap,
  PopoverRoot,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverBody,
  Portal,
  IconButton,
  Icon,
  useBreakpointValue,
  Box,
} from "@chakra-ui/react"
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
  buttonVariant?: string
  buttonColorScheme?: string
  disabled?: boolean
  showAddButton?: boolean
  scrollHorizontal?: boolean
  user: User
  isOpen?: boolean
  darkBg?: boolean
}

const ReactionSelection = memo(function ReactionSelection({
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

  // Memoize filtered reaction keys
  const reactionKeys = useMemo(
    () => Object.keys(reactions).filter((x) => !!reactions[x].length),
    [reactions],
  )

  return (
    <HStack w="100%">
      <Wrap flexShrink={scrollHorizontal ? 0 : 1}>
        {reactionKeys.map((x) => (
          <Box key={x} justifyContent="center" alignItems="center">
            <ReactionCounterItem
              count={reactions[x].length}
              users={reactions[x].map(({ user }: Reaction) => user)}
              currentUserId={user.userId}
              colorScheme={buttonColorScheme}
              onReactionClick={onSelect}
              emoji={x}
              darkBg={darkBg}
            />
          </Box>
        ))}
        <Box
          css={{
            "&:last-child::after": {
              content: '""',
              paddingRight: 2,
            },
          }}
        >
          <PopoverRoot
            lazyMount
            open={isOpen}
            onOpenChange={(e) => !e.open && onClose()}
            autoFocus={autoFocus}
            initialFocusEl={() => responsivePickerRef?.current}
            closeOnInteractOutside
            closeOnEscape
          >
            <PopoverTrigger asChild>
              <Box
                opacity={showAddButton ? 1 : 0}
                transition="opacity 0.1s"
              >
                <IconButton
                  p={1}
                  aria-label="Add reaction"
                  size="sm"
                  variant={darkBg ? "ghost" : "ghost"}
                  colorPalette={buttonColorScheme}
                  disabled={!showAddButton}
                  onClick={() => onToggle()}
                >
                  <Icon as={FiSmile} />
                  <Icon boxSize={3} as={FiPlus} />
                </IconButton>
              </Box>
            </PopoverTrigger>
            <Portal>
              <PopoverContent>
                <PopoverArrow />
                <PopoverBody
                  css={{
                    "& em-emoji-picker": {
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
          </PopoverRoot>
        </Box>
      </Wrap>
    </HStack>
  )
})

export default ReactionSelection
