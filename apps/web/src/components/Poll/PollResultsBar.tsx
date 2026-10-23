import type { ElementType } from "react"
import { Badge, Box, HStack, Icon, Text } from "@chakra-ui/react"

type Props = {
  label: string
  icon?: ElementType
  count: number
  pct: number
  isWinner: boolean
  isTie: boolean
  countRef?: (el: HTMLSpanElement | null) => void
  barRef?: (el: HTMLDivElement | null) => void
}

export function PollResultsBar({
  label,
  icon,
  count,
  pct,
  isWinner,
  isTie,
  countRef,
  barRef,
}: Props) {
  const pctLabel = pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`

  return (
    <Box w="100%">
      <HStack justify="space-between" mb={1} gap={2}>
        <HStack gap={1.5} minW={0}>
          {icon ? <Icon as={icon} boxSize={3.5} flexShrink={0} aria-hidden /> : null}
          <Text fontSize="sm" fontWeight="medium" lineClamp={2}>
            {label}
          </Text>
        </HStack>
        <HStack gap={1} flexShrink={0}>
          {isWinner && (
            <Badge size="sm" colorPalette={isTie ? "orange" : "green"}>
              {isTie ? "Tie" : "Winner"}
            </Badge>
          )}
          <Text fontSize="sm" color="fg.muted">
            <span ref={countRef}>{count}</span> · {pctLabel}
          </Text>
        </HStack>
      </HStack>
      <Box
        ref={barRef}
        h="2"
        borderRadius="full"
        bg="bg.muted"
        overflow="hidden"
        style={{ ["--pct" as string]: `${pct}%` }}
      >
        <Box
          h="100%"
          w="var(--pct, 0%)"
          bg="colorPalette.solid"
          colorPalette="primary"
          borderRadius="full"
          transition="width 180ms ease"
        />
      </Box>
    </Box>
  )
}
