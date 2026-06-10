import { Badge, Box, Stack, Text } from "@chakra-ui/react"
import Modal from "../Modal"
import { PollResultsBar } from "./PollResultsBar"
import { useIsModalOpen, useModalsSend, usePollHistory } from "../../hooks/useActors"

function formatClosedAt(ts: number | null) {
  if (!ts) return ""
  return new Date(ts).toLocaleString()
}

export default function PollHistoryModal() {
  const modalSend = useModalsSend()
  const isOpen = useIsModalOpen("pollHistory")
  const history = usePollHistory()

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => modalSend({ type: "CLOSE" })}
      heading="Poll history"
      showFooter={false}
    >
      <Stack gap={6} maxH="70vh" overflowY="auto" py={2}>
        {history.length === 0 && (
          <Text color="fg.muted">No closed polls yet.</Text>
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
