import { useEffect, useRef, type ElementType } from "react"
import { Badge, Box, Stack, Text } from "@chakra-ui/react"
import type { MyPollVote, Poll, PollOption } from "@repo/types/Poll"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"
import { runVoteTickAnimation } from "../../animations/voteTickAnimation"
import { PollOptionButton } from "./PollOptionButton"

const SCROLLABLE_OPTION_THRESHOLD = 8

/** Chat column width where two vote buttons fit beside each other. Phones stay stacked. */
const PAIR_OPTIONS_MIN_CHAT = "30rem"

type Props = {
  poll: Poll
  myVote: MyPollVote | null
  totalVotes: number | null
  votePending: boolean
  confirmOptionId: string | null
  onVote: (option: PollOption) => void
  formatOptionLabel?: (option: PollOption) => string
  optionIcon?: (option: PollOption) => ElementType | undefined
  /** Two-option trip polls: row once the chat column is wide enough. */
  pairOptions?: boolean
  /** In that row, the first option sits on the right. */
  exitOnRight?: boolean
}

export function PollVotingSection({
  poll,
  myVote,
  totalVotes,
  votePending,
  confirmOptionId,
  onVote,
  formatOptionLabel,
  optionIcon,
  pairOptions = false,
  exitOnRight = false,
}: Props) {
  const animationsEnabled = useAnimationsEnabled()
  const totalRef = useRef<HTMLSpanElement>(null)
  const prevTotalRef = useRef<number | null>(null)
  const scrollable = poll.options.length > SCROLLABLE_OPTION_THRESHOLD
  const pair = pairOptions && poll.options.length === 2
  const exitRight = pair && exitOnRight

  const votedLabel = myVote
    ? poll.options.find((o) => o.id === myVote.optionId)?.label
    : undefined

  useEffect(() => {
    if (totalVotes == null || totalRef.current == null) {
      prevTotalRef.current = totalVotes
      return
    }
    if (
      animationsEnabled &&
      prevTotalRef.current != null &&
      totalVotes !== prevTotalRef.current &&
      !votePending
    ) {
      const span = document.createElement("span")
      span.textContent = String(totalVotes)
      const cleanup = runVoteTickAnimation(totalRef.current, span, () => {
        if (totalRef.current) totalRef.current.textContent = String(totalVotes)
      })
      prevTotalRef.current = totalVotes
      return cleanup
    }
    prevTotalRef.current = totalVotes
    if (totalRef.current) totalRef.current.textContent = String(totalVotes)
  }, [totalVotes, animationsEnabled, votePending])

  return (
    <Stack gap={3}>
      <Box
        data-option-layout={exitRight ? "pair-exit-right" : pair ? "pair" : "stack"}
        display="flex"
        alignItems="stretch"
        gap={2}
        maxH={scrollable ? "60vh" : undefined}
        overflowY={scrollable ? "auto" : undefined}
        css={{
          flexDirection: "column",
          ...(pair
            ? {
                [`@container chat (min-width: ${PAIR_OPTIONS_MIN_CHAT})`]: {
                  flexDirection: exitRight ? "row-reverse" : "row",
                  "& > button": {
                    flex: "1 1 0",
                    minWidth: 0,
                    width: "auto",
                  },
                },
              }
            : {}),
        }}
      >
        {poll.options.map((option) => {
          const selected = myVote?.optionId === option.id
          return (
            <PollOptionButton
              key={option.id}
              label={formatOptionLabel ? formatOptionLabel(option) : option.label}
              icon={optionIcon?.(option)}
              selected={selected}
              disabled={votePending}
              showConfirmAnimation={confirmOptionId === option.id}
              onClick={() => onVote(option)}
            />
          )
        })}
      </Box>
      {myVote && votedLabel && (
        <Badge colorPalette="primary" alignSelf="flex-start">
          You voted for {votedLabel}
        </Badge>
      )}
      {totalVotes != null && (
        <Text fontSize="sm" color="fg.muted">
          <span ref={totalRef}>{totalVotes}</span> vote{totalVotes === 1 ? "" : "s"} cast
        </Text>
      )}
      {poll.settings.hideRunningTotal && totalVotes == null && (
        <Text fontSize="sm" color="fg.muted">
          Vote total hidden until close
        </Text>
      )}
    </Stack>
  )
}
