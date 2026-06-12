import { useCallback, useEffect, useState } from "react"
import { Badge, Box, Button, HStack, Separator, Stack, Text } from "@chakra-ui/react"
import type { PollOption } from "@repo/types/Poll"
import Modal from "../Modal"
import PollAuthor from "../Modals/Admin/PollAuthor"
import { emitToSocket } from "../../actors/socketActor"
import { PollResultsBar } from "./PollResultsBar"
import { PollVotingSection } from "./PollVotingSection"
import {
  useActivePoll,
  useCurrentRoom,
  useIsAdmin,
  useIsModalOpen,
  useModalsSend,
  useMyPollVote,
  usePollHistory,
  usePollSend,
  usePollTotalVotes,
  useVotePending,
} from "../../hooks/useActors"

function formatClosedAt(ts: number | null) {
  if (!ts) return ""
  return new Date(ts).toLocaleString()
}

export default function PollHistoryModal() {
  const modalSend = useModalsSend()
  const pollSend = usePollSend()
  const isOpen = useIsModalOpen("pollHistory")
  const isAdmin = useIsAdmin()
  const room = useCurrentRoom()
  const activePoll = useActivePoll()
  const myVote = useMyPollVote()
  const totalVotes = usePollTotalVotes()
  const votePending = useVotePending()
  const history = usePollHistory()
  const [confirmOptionId, setConfirmOptionId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  const openActivePoll = activePoll?.status === "open" ? activePoll : null
  const hasActiveOpenPoll = openActivePoll != null
  const roomId = room?.id

  const closePoll = useCallback(() => {
    if (!openActivePoll) return
    setClosing(true)
    emitToSocket("CLOSE_POLL", { pollId: openActivePoll.id })
  }, [openActivePoll])

  useEffect(() => {
    if (!hasActiveOpenPoll) setClosing(false)
  }, [hasActiveOpenPoll])

  useEffect(() => {
    if (!votePending && myVote?.optionId) {
      setConfirmOptionId(myVote.optionId)
      const t = window.setTimeout(() => setConfirmOptionId(null), 400)
      return () => window.clearTimeout(t)
    }
  }, [votePending, myVote?.optionId])

  const handleVote = useCallback(
    (option: PollOption) => {
      if (!openActivePoll || votePending) return
      pollSend({
        type: "CAST_VOTE",
        data: { pollId: openActivePoll.id, optionId: option.id },
      })
    },
    [openActivePoll, pollSend, votePending],
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => modalSend({ type: "CLOSE" })}
      heading="Polls"
      showFooter={false}
    >
      <Stack gap={6} maxH="70vh" overflowY="auto" py={2}>
        {openActivePoll && (
          <Box borderWidth="1px" borderRadius="md" p={4}>
            <Stack gap={3}>
              <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                <Stack gap={2} flex={1} minW={0}>
                  <Text fontWeight="semibold">{openActivePoll.question}</Text>
                  <Badge alignSelf="flex-start" colorPalette="green">
                    Active
                  </Badge>
                </Stack>
                {isAdmin && (
                  <Button
                    size="sm"
                    colorPalette="red"
                    variant="outline"
                    loading={closing}
                    onClick={closePoll}
                    flexShrink={0}
                  >
                    Close poll
                  </Button>
                )}
              </HStack>
              <PollVotingSection
                poll={openActivePoll}
                myVote={myVote}
                totalVotes={totalVotes}
                votePending={votePending}
                confirmOptionId={confirmOptionId}
                onVote={handleVote}
              />
            </Stack>
          </Box>
        )}

        {isAdmin && (
          <>
            <Separator />
            <Stack gap={3}>
              <Text fontWeight="semibold" fontSize="sm">
                Create poll
              </Text>
              {!hasActiveOpenPoll && (
                <Text fontSize="sm" color="fg.muted">
                  Publish a new poll for listeners in this room.
                </Text>
              )}
              <PollAuthor roomId={roomId} hasActiveOpenPoll={hasActiveOpenPoll} />
            </Stack>
          </>
        )}

        {(openActivePoll || isAdmin) && history.length > 0 && <Separator />}

        {history.length === 0 && !openActivePoll && !isAdmin && (
          <Text color="fg.muted">No polls yet.</Text>
        )}

        {history.map(({ poll, results }) => {
          const total = results.totalVotes || 1
          const winnerIds = new Set(results.winners)
          const isTie = winnerIds.size > 1
          const sorted = [...poll.options]
            .map((option) => {
              const count = results.optionTallies[option.id] ?? 0
              const pct = total > 0 ? (count / total) * 100 : 0
              return { option, count, pct }
            })
            .sort((a, b) => b.count - a.count || a.option.label.localeCompare(b.option.label))

          return (
            <Box key={poll.id} borderWidth="1px" borderRadius="md" p={4}>
              <Stack gap={2}>
                <Text fontWeight="semibold">{poll.question}</Text>
                <Text fontSize="xs" color="fg.muted">
                  Closed {formatClosedAt(poll.closedAt)}
                </Text>
                <Stack gap={3} mt={2}>
                  {sorted.map(({ option, count, pct }) => (
                    <PollResultsBar
                      key={option.id}
                      label={option.label}
                      count={count}
                      pct={pct}
                      isWinner={winnerIds.has(option.id)}
                      isTie={isTie}
                    />
                  ))}
                </Stack>
                <Badge alignSelf="flex-start" colorPalette="gray">
                  {results.totalVotes} total votes
                </Badge>
              </Stack>
            </Box>
          )
        })}
      </Stack>
    </Modal>
  )
}
