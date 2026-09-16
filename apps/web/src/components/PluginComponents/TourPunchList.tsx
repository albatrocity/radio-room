import { HStack, Stack, Text } from "@chakra-ui/react"
import type { InventoryItem } from "@repo/types"
import { TOUR_LAMINATE_PUNCH_HISTORY_LIMIT } from "@repo/types"
import {
  coinsForPunchNumber,
  currentTourStreak,
  formatPunchCount,
  readTourPunchCount,
  readTourPunches,
  type PunchCountNoun,
} from "@repo/game-logic"

function formatWhen(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(ms))
  } catch {
    return String(ms)
  }
}

export function TourPunchList({
  item,
  noun,
}: {
  item: InventoryItem
  noun: PunchCountNoun
}) {
  const history = [...readTourPunches(item)].sort((a, b) => b.at - a.at)
  const count = readTourPunchCount(item)
  const streak = currentTourStreak(readTourPunches(item))
  const nextCoins = coinsForPunchNumber(count + 1)
  const trimmed = count > history.length

  return (
    <Stack gap={3} w="full" pt={2}>
      <HStack gap={3} flexWrap="wrap" justify="center">
        <Text fontSize="sm" fontWeight="semibold">
          {formatPunchCount(count, noun)}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Streak {streak}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Next +{nextCoins}
        </Text>
      </HStack>
      {history.length === 0 ? (
        <Text fontSize="sm" color="fg.muted" textAlign="center">
          No {noun.plural} yet — bring it to a show.
        </Text>
      ) : (
        <Stack gap={2}>
          {history.map((punch) => (
            <HStack
              key={`${punch.key}-${punch.at}`}
              justify="space-between"
              gap={3}
              fontSize="sm"
              borderWidth="1px"
              borderColor="border.muted"
              borderRadius="md"
              px={3}
              py={2}
            >
              <Stack gap={0} minW={0}>
                <Text fontWeight="medium" truncate>
                  {punch.label?.trim() || punch.key}
                </Text>
                <Text fontSize="xs" color="fg.muted" truncate>
                  {[punch.holderUsername, formatWhen(punch.at)].filter(Boolean).join(" · ")}
                </Text>
              </Stack>
              <Text fontWeight="semibold" flexShrink={0}>
                +{punch.coins}
              </Text>
            </HStack>
          ))}
        </Stack>
      )}
      {trimmed ? (
        <Text fontSize="xs" color="fg.muted" textAlign="center">
          Showing the most recent {TOUR_LAMINATE_PUNCH_HISTORY_LIMIT} of {count} {noun.plural}.
        </Text>
      ) : null}
    </Stack>
  )
}
