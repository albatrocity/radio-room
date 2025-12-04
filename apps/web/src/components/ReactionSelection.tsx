import { useRef, memo, useMemo, RefObject } from "react"
import {
  HStack,
  Wrap,
  Popover,
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
  buttonVariant,
  darkBg,
  isOpen = false,
  onClose,
  onToggle,
  showAddButton,
}: ReactionSelectionProps) {
  const pickerRef: RefObject<HTMLDivElement | null> = useRef<HTMLDivElement | null>(null)
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
        <Box>
          <Popover.Root
            lazyMount
            open={isOpen}
            onOpenChange={(e) => !e.open && onClose()}
            autoFocus={autoFocus}
            initialFocusEl={() => responsivePickerRef?.current}
            closeOnInteractOutside
            closeOnEscape
          >
            <Popover.Trigger asChild>
              <Box opacity={showAddButton ? 1 : 0} transition="opacity 0.1s">
                <IconButton
                  aria-label="Add reaction"
                  size="xs"
                  width="2.6rem"
                  variant={buttonVariant}
                  colorPalette={buttonColorScheme}
                  disabled={!showAddButton}
                  onClick={() => onToggle()}
                >
                  <Icon as={FiSmile} />
                  <Icon boxSize={3} as={FiPlus} />
                </IconButton>
              </Box>
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner>
                <Popover.Content css={{ "--popover-bg": "{colors.appBg}" }}>
                  <Popover.Arrow />
                  <Popover.Body
                    css={{
                      paddingRight: 3,
                      paddingLeft: 0,
                      "& em-emoji-picker": {
                        "--shadow": "0",
                        "--rgb-background": "transparent",
                        "--background": "transparent",
                      },
                      _dark: {
                        "& em-emoji-picker": {
                          "--rgb-color": "255, 255, 255",
                          "--rgb-input": "0 0 0",
                        },
                      },
                    }}
                  >
                    <ReactionPicker onSelect={onSelect} ref={pickerRef} autoFocus={autoFocus} />
                  </Popover.Body>
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>
        </Box>
      </Wrap>
    </HStack>
  )
})

export default ReactionSelection
