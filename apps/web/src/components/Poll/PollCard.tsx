import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  Box,
  Button,
  CloseButton,
  HStack,
  IconButton,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { LuMaximize2, LuMinus } from "react-icons/lu"
import type { PollOption } from "@repo/types/Poll"
import { useMachine } from "@xstate/react"
import {
  useActivePoll,
  useCurrentRoom,
  useIsAdmin,
  useMyPollVote,
  usePollSend,
  usePollTotalVotes,
  useRevealResults,
  useVotePending,
} from "../../hooks/useActors"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"
import { useAnimeScope } from "../../animations/useAnimeScope"
import { runPollMountAnimation } from "../../animations/pollMountAnimation"
import { runPollRevealAnimation } from "../../animations/pollRevealAnimation"
import { applyPollPulse, findTargetElement } from "../../lib/screenEffects"
import { getPollDisplayMode } from "../../lib/pollDisplayPreference"
import { emitToSocket } from "../../actors/socketActor"
import { pollActor } from "../../actors/pollActor"
import {
  pollCardDisplayMachine,
  REVEAL_DURATION_MS,
  type PollCardDisplayState,
} from "../../machines/pollCardDisplayMachine"
import { ExpiryBar } from "../ExpiryBar"
import { PollResultsBar } from "./PollResultsBar"
import { PollVotingSection } from "./PollVotingSection"

const SCROLLABLE_OPTION_THRESHOLD = 8

function truncateQuestion(question: string, max = 50) {
  return question.length > max ? `${question.slice(0, max - 1)}…` : question
}

function PollCard() {
  const poll = useActivePoll()
  const revealResults = useRevealResults()
  const myVote = useMyPollVote()
  const totalVotes = usePollTotalVotes()
  const votePending = useVotePending()
  const pollSend = usePollSend()
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  const animationsEnabled = useAnimationsEnabled()

  const pollSendRef = useRef(pollSend)
  pollSendRef.current = pollSend

  const machine = useMemo(
    () =>
      pollCardDisplayMachine.provide({
        actions: {
          onRevealTimeout: () => pollSendRef.current({ type: "CLEAR_REVEAL" }),
        },
      }),
    [],
  )

  const [state, send] = useMachine(machine, {
    input: {
      roomId: "",
      pollId: null,
      initialMode: "expanded",
    },
  })

  const displayState = (state.value ?? "boot") as PollCardDisplayState
  const revealStartedAt = state.context?.revealStartedAt ?? null

  const cardRef = useRef<HTMLDivElement>(null)
  const [confirmOptionId, setConfirmOptionId] = useState<string | null>(null)
  const barRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const countRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const prevPollIdRef = useRef<string | null>(null)

  useAnimeScope(cardRef, animationsEnabled)

  const isRevealing = poll?.status === "closed" && revealResults != null
  const scrollable = (poll?.options.length ?? 0) > SCROLLABLE_OPTION_THRESHOLD
  const showFullResults =
    isRevealing && (displayState === "revealing" || displayState === "expanded")

  const sortedRevealOptions = useMemo(() => {
    if (!poll || !revealResults) return []
    const total = revealResults.totalVotes || 1
    return [...poll.options]
      .map((option) => {
        const count = revealResults.optionTallies[option.id] ?? 0
        const pct = total > 0 ? (count / total) * 100 : 0
        return { option, count, pct }
      })
      .sort((a, b) => b.count - a.count || a.option.label.localeCompare(b.option.label))
  }, [poll, revealResults])

  const winnerIds = useMemo(() => new Set(revealResults?.winners ?? []), [revealResults])
  const isTie = winnerIds.size > 1

  useLayoutEffect(() => {
    if (!room?.id || !poll?.id) return
    send({
      type: "HYDRATE",
      roomId: room.id,
      pollId: poll.id,
      mode: getPollDisplayMode(room.id, poll.id),
    })
  }, [room?.id, poll?.id, send])

  useEffect(() => {
    if (!poll?.id || poll.status !== "open") {
      if (!poll?.id) prevPollIdRef.current = null
      return
    }
    if (prevPollIdRef.current !== null && poll.id !== prevPollIdRef.current) {
      send({ type: "NEW_POLL_PUBLISHED", pollId: poll.id })
    }
    prevPollIdRef.current = poll.id
  }, [poll?.id, poll?.status, send])

  useEffect(() => {
    if (isRevealing) send({ type: "POLL_CLOSED" })
  }, [isRevealing, send])

  useEffect(() => {
    if (!poll || !animationsEnabled || !cardRef.current) return
    const key = `${poll.id}:mount`
    if (pollActor.getSnapshot().context.seenAnimations.has(key)) return

    const cleanup = runPollMountAnimation(cardRef.current, () => {
      pollSend({ type: "MARK_ANIMATION_SEEN", data: { key } })
    })
    return cleanup
  }, [poll?.id, animationsEnabled, pollSend, poll])

  useEffect(() => {
    if (!poll || !animationsEnabled) return
    const key = `${poll.id}:pulse`
    if (pollActor.getSnapshot().context.seenAnimations.has(key)) return
    const roomEl = findTargetElement("room")
    if (!roomEl) return
    void applyPollPulse(roomEl).then(() => {
      pollSend({ type: "MARK_ANIMATION_SEEN", data: { key } })
    })
  }, [poll?.id, animationsEnabled, pollSend, poll])

  useEffect(() => {
    if (!showFullResults || !animationsEnabled || !cardRef.current || !revealResults) return
    const key = `${poll!.id}:reveal`
    if (pollActor.getSnapshot().context.seenAnimations.has(key)) return

    const bars = sortedRevealOptions
      .map(({ option, count, pct }) => ({
        el: barRefs.current.get(option.id)!,
        finalPct: pct,
        finalCount: count,
        countEl: countRefs.current.get(option.id) ?? null,
      }))
      .filter((b) => b.el)

    const cleanup = runPollRevealAnimation(cardRef.current, bars, null, () => {
      pollSend({ type: "MARK_ANIMATION_SEEN", data: { key } })
    })
    return cleanup
  }, [showFullResults, animationsEnabled, revealResults, sortedRevealOptions, poll, pollSend])

  useEffect(() => {
    if (!votePending && myVote?.optionId) {
      setConfirmOptionId(myVote.optionId)
      const t = window.setTimeout(() => setConfirmOptionId(null), 400)
      return () => window.clearTimeout(t)
    }
  }, [votePending, myVote?.optionId])

  const handleVote = useCallback(
    (option: PollOption) => {
      if (!poll || votePending) return
      pollSend({ type: "CAST_VOTE", data: { pollId: poll.id, optionId: option.id } })
    },
    [poll, pollSend, votePending],
  )

  const handleClosePoll = useCallback(() => {
    if (!poll) return
    emitToSocket("CLOSE_POLL", { pollId: poll.id })
  }, [poll])

  if (!poll || !state.context || displayState === "dismissed" || displayState === "boot") {
    return null
  }

  const votedLabel = myVote ? poll.options.find((o) => o.id === myVote.optionId)?.label : undefined

  if (displayState === "collapsed") {
    return (
      <Box position="sticky" top={0} zIndex={3} px={2} pt={2}>
        <HStack
          px={3}
          py={2}
          borderWidth="1px"
          borderRadius="lg"
          bg="bg"
          shadow="sm"
          cursor="pointer"
          onClick={() => send({ type: "EXPAND" })}
          data-poll-card
        >
          <Text fontSize="sm" flex={1}>
            Poll: {truncateQuestion(poll.question)}
            {isRevealing ? " · Results" : ""}
            {!isRevealing && totalVotes != null ? ` · ${totalVotes} votes` : ""}
            {!isRevealing && votedLabel ? " · You voted ✓" : ""}
          </Text>
          <IconButton
            aria-label="Expand poll"
            size="xs"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              send({ type: "EXPAND" })
            }}
          >
            <LuMaximize2 />
          </IconButton>
          <CloseButton
            size="xs"
            aria-label="Dismiss poll"
            onClick={(e) => {
              e.stopPropagation()
              send({ type: "DISMISS" })
            }}
          />
        </HStack>
      </Box>
    )
  }

  return (
    <Box position="sticky" top={0} zIndex={3} px={2} pt={2} data-poll-card>
      <Box
        ref={cardRef}
        borderWidth="1px"
        borderRadius="lg"
        bg="bg"
        shadow="md"
        p={4}
        transition={animationsEnabled ? "max-height 180ms ease, opacity 180ms ease" : "none"}
      >
        <HStack justify="space-between" align="start" mb={3}>
          <Text fontWeight="semibold" fontSize="md" flex={1}>
            {poll.question}
          </Text>
          <HStack gap={1}>
            {isAdmin && poll.status === "open" && (
              <Button size="sm" colorPalette="red" variant="outline" onClick={handleClosePoll}>
                Close poll
              </Button>
            )}
            <IconButton
              aria-label="Collapse poll"
              size="sm"
              variant="ghost"
              onClick={() => send({ type: "COLLAPSE" })}
            >
              <LuMinus />
            </IconButton>
            <CloseButton
              size="sm"
              aria-label="Dismiss poll"
              onClick={() => send({ type: "DISMISS" })}
            />
          </HStack>
        </HStack>

        {showFullResults && revealResults ? (
          <Stack gap={3}>
            <VStack
              align="stretch"
              gap={3}
              maxH={scrollable ? "60vh" : undefined}
              overflowY={scrollable ? "auto" : undefined}
            >
              {sortedRevealOptions.map(({ option, count, pct }) => (
                <PollResultsBar
                  key={option.id}
                  label={option.label}
                  count={count}
                  pct={pct}
                  isWinner={winnerIds.has(option.id)}
                  isTie={isTie}
                  barRef={(el) => {
                    if (el) barRefs.current.set(option.id, el)
                  }}
                  countRef={(el) => {
                    if (el) countRefs.current.set(option.id, el)
                  }}
                />
              ))}
            </VStack>
            <Text fontSize="sm" color="fg.muted">
              Total: {revealResults.totalVotes} votes
            </Text>
            {revealStartedAt && (
              <ExpiryBar
                startAt={revealStartedAt}
                endAt={revealStartedAt + REVEAL_DURATION_MS}
                color="primary.solid"
                height="3px"
              />
            )}
          </Stack>
        ) : (
          <PollVotingSection
            poll={poll}
            myVote={myVote}
            totalVotes={totalVotes}
            votePending={votePending}
            confirmOptionId={confirmOptionId}
            onVote={handleVote}
          />
        )}
      </Box>
    </Box>
  )
}

export default memo(PollCard)
