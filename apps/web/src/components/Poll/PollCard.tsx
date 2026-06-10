import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Badge,
  Box,
  Button,
  CloseButton,
  HStack,
  IconButton,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { LuMinus, LuSquare } from "react-icons/lu"
import type { PollOption } from "@repo/types/Poll"
import {
  useActivePoll,
  useCurrentRoom,
  useIsAdmin,
  useModalsSend,
  useMyPollVote,
  usePollSend,
  usePollTotalVotes,
  useRevealResults,
  useVotePending,
} from "../../hooks/useActors"
import { usePollDisplayMode } from "../../hooks/usePollDisplayMode"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"
import { useAnimeScope } from "../../animations/useAnimeScope"
import { runPollMountAnimation } from "../../animations/pollMountAnimation"
import { runPollRevealAnimation } from "../../animations/pollRevealAnimation"
import { runVoteTickAnimation } from "../../animations/voteTickAnimation"
import { applyPollPulse, findTargetElement } from "../../lib/screenEffects"
import { emitToSocket } from "../../actors/socketActor"
import { pollActor } from "../../actors/pollActor"
import { PollOptionButton } from "./PollOptionButton"
import { PollResultsBar } from "./PollResultsBar"

const REVEAL_MS = 10_000
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
  const modalSend = useModalsSend()
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  const animationsEnabled = useAnimationsEnabled()
  const { mode, setMode } = usePollDisplayMode(room?.id, poll?.id)

  const cardRef = useRef<HTMLDivElement>(null)
  const totalRef = useRef<HTMLSpanElement>(null)
  const prevTotalRef = useRef<number | null>(null)
  const [revealOverride, setRevealOverride] = useState(false)
  const [confirmOptionId, setConfirmOptionId] = useState<string | null>(null)
  const [pulseHidden, setPulseHidden] = useState(false)
  const barRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const countRefs = useRef<Map<string, HTMLSpanElement>>(new Map())

  useAnimeScope(cardRef, animationsEnabled)

  const isRevealing = poll?.status === "closed" && revealResults != null
  const effectiveMode = revealOverride || isRevealing ? "expanded" : mode
  const scrollable = (poll?.options.length ?? 0) > SCROLLABLE_OPTION_THRESHOLD

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
    if (!isRevealing) return
    setRevealOverride(true)
    const timer = window.setTimeout(() => {
      pollSend({ type: "CLEAR_REVEAL" })
      setRevealOverride(false)
    }, REVEAL_MS)
    return () => window.clearTimeout(timer)
  }, [isRevealing, pollSend])

  useEffect(() => {
    if (!isRevealing || !animationsEnabled || !cardRef.current || !revealResults) return
    const key = `${poll!.id}:reveal`
    if (pollActor.getSnapshot().context.seenAnimations.has(key)) return

    const bars = sortedRevealOptions.map(({ option, count, pct }) => ({
      el: barRefs.current.get(option.id)!,
      finalPct: pct,
      finalCount: count,
      countEl: countRefs.current.get(option.id) ?? null,
    })).filter((b) => b.el)

    const cleanup = runPollRevealAnimation(cardRef.current, bars, null, () => {
      pollSend({ type: "MARK_ANIMATION_SEEN", data: { key } })
    })
    return cleanup
  }, [isRevealing, animationsEnabled, revealResults, sortedRevealOptions, poll, pollSend])

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

  useEffect(() => {
    if (!votePending && myVote?.optionId) {
      setConfirmOptionId(myVote.optionId)
      const t = window.setTimeout(() => setConfirmOptionId(null), 400)
      return () => window.clearTimeout(t)
    }
  }, [votePending, myVote?.optionId])

  useEffect(() => {
    if (totalVotes == null) return
    setPulseHidden(true)
    const t = window.setTimeout(() => setPulseHidden(false), 1000)
    return () => window.clearTimeout(t)
  }, [totalVotes])

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

  if (!poll) return null

  const votedLabel = myVote
    ? poll.options.find((o) => o.id === myVote.optionId)?.label
    : undefined

  if (effectiveMode === "hidden") {
    return (
      <Box position="sticky" top={0} zIndex={3} px={2} pt={2} pointerEvents="none">
        <Button
          size="sm"
          position="absolute"
          right={3}
          bottom={3}
          pointerEvents="auto"
          aria-label="Show poll"
          onClick={() => setMode("expanded")}
          transform={pulseHidden ? "scale(1.05)" : "scale(1)"}
          transition={animationsEnabled ? "transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none"}
        >
          Polls 🗳️
          {totalVotes != null ? ` · ${totalVotes}` : ""}
        </Button>
      </Box>
    )
  }

  if (effectiveMode === "collapsed") {
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
          onClick={() => setMode("expanded")}
          data-poll-card
        >
          <Text fontSize="sm" flex={1}>
            Poll: {truncateQuestion(poll.question)}
            {totalVotes != null ? ` · ${totalVotes} votes` : ""}
            {votedLabel ? " · You voted ✓" : ""}
          </Text>
          {isAdmin && poll.status === "open" && (
            <Button size="xs" variant="outline" onClick={(e) => { e.stopPropagation(); handleClosePoll() }}>
              Close
            </Button>
          )}
          <IconButton
            aria-label="Expand poll"
            size="xs"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              setMode("expanded")
            }}
          >
            <LuSquare />
          </IconButton>
          <CloseButton
            size="xs"
            aria-label="Hide poll"
            onClick={(e) => {
              e.stopPropagation()
              setMode("hidden")
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
              onClick={() => setMode("collapsed")}
            >
              <LuMinus />
            </IconButton>
            <CloseButton
              size="sm"
              aria-label="Hide poll"
              onClick={() => setMode("hidden")}
            />
          </HStack>
        </HStack>

        {isRevealing && revealResults ? (
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
            <HStack justify="space-between">
              <Text fontSize="sm" color="fg.muted">
                Total: {revealResults.totalVotes} votes
              </Text>
              <Button size="sm" variant="outline" onClick={() => modalSend({ type: "VIEW_POLL_HISTORY" })}>
                View history
              </Button>
            </HStack>
          </Stack>
        ) : (
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
                    onClick={() => handleVote(option)}
                  />
                )
              })}
            </VStack>
            {myVote && votedLabel && (
              <Badge colorPalette="blue" alignSelf="flex-start">
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
        )}
      </Box>
    </Box>
  )
}

export default memo(PollCard)
