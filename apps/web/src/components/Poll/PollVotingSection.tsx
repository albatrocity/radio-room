import { useEffect, useRef } from "react"
import { Badge, Stack, Text, VStack } from "@chakra-ui/react"
import type { MyPollVote, Poll, PollOption } from "@repo/types/Poll"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"
import { runVoteTickAnimation } from "../../animations/voteTickAnimation"
import { PollOptionButton } from "./PollOptionButton"

const SCROLLABLE_OPTION_THRESHOLD = 8

type Props = {
  poll: Poll
  myVote: MyPollVote | null
  totalVotes: number | null
  votePending: boolean
  confirmOptionId: string | null
  onVote: (option: PollOption) => void
}

export function PollVotingSection({
  poll,
  myVote,
  totalVotes,
  votePending,
  confirmOptionId,
  onVote,
}: Props) {
  const animationsEnabled = useAnimationsEnabled()
  const totalRef = useRef<HTMLSpanElement>(null)
  const prevTotalRef = useRef<number | null>(null)
  const scrollable = poll.options.length > SCROLLABLE_OPTION_THRESHOLD

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
      <VStack
        align="stretch"
        gap={2}
        maxH={scrollable ? "60vh" : undefined}
        overflowY={scrollable ? "auto" : undefined}
      >
        {poll.options.map((option) => {
          const selected = myVote?.optionId === option.id
          return (
            <PollOptionButton
              key={option.id}
              label={option.label}
              selected={selected}
              disabled={votePending}
              showConfirmAnimation={confirmOptionId === option.id}
              onClick={() => onVote(option)}
            />
          )
        })}
      </VStack>
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
