import { Box, HStack, Text, VStack } from "@chakra-ui/react"
import { interpolateTemplate } from "@repo/utils"
import { usePluginComponentContext } from "../context"
import { CompositeTemplateRenderer } from "./CompositeTemplateRenderer"
import type { LeaderboardComponentProps, LeaderboardEntry } from "../../../types/PluginComponent"

/**
 * Leaderboard component - renders a sorted list with scores.
 */
export function LeaderboardTemplateComponent({
  dataKey,
  title,
  rowTemplate = "{{value}}: {{score}}",
  maxItems = 10,
  showRank = true,
}: LeaderboardComponentProps) {
  const { store } = usePluginComponentContext()

  const data = store[dataKey] as LeaderboardEntry[] | undefined
  if (!data || !Array.isArray(data)) {
    return (
      <Box>
        <Text fontSize="sm" color="gray.500">
          No data available
        </Text>
      </Box>
    )
  }

  // Sort by score descending and limit items
  const sortedData = [...data].sort((a, b) => b.score - a.score).slice(0, maxItems)

  return (
    <VStack align="stretch" spacing={2}>
      {title && (
        <Text fontSize="md" fontWeight="bold">
          {title}
        </Text>
      )}
      {sortedData.map((entry, index) => {
        const rank = index + 1
        const values = {
          value: entry.value,
          score: entry.score,
          rank,
        }

        // Render template content
        const templateContent = Array.isArray(rowTemplate) ? (
          <CompositeTemplateRenderer template={rowTemplate} values={values} />
        ) : (
          interpolateTemplate(rowTemplate, values)
        )

        return (
          <HStack key={entry.value} spacing={2}>
            {showRank && (
              <Text fontSize="sm" color="gray.500" minW="24px">
                {rank}.
              </Text>
            )}
            <Text fontSize="sm">{templateContent}</Text>
          </HStack>
        )
      })}
      {sortedData.length === 0 && (
        <Text fontSize="sm" color="gray.500">
          No entries yet
        </Text>
      )}
    </VStack>
  )
}

