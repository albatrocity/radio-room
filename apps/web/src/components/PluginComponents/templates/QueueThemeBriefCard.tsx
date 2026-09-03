import { Box, Text, VStack } from "@chakra-ui/react"
import type { QueueThemeUserGameState } from "@repo/types"
import type { QueueThemeBriefCardComponentProps } from "../../../types/PluginComponent"
import { useUserGameStatePayload } from "../../../hooks/useActors"
import { getPluginUserState } from "../../../lib/getPluginUserState"
import { usePluginComponentContext } from "../context"

type Props = QueueThemeBriefCardComponentProps

/**
 * Renders the current user's Queue Theme assignment from `pluginUserState` (ADR 0097).
 * Reads the room-scoped userGameState actor so it works in aboveChat and Add to Queue
 * (outside UserGameStateSurface).
 */
export function QueueThemeBriefCardTemplateComponent(_props: Props) {
  const { pluginName, store } = usePluginComponentContext()!
  const payload = useUserGameStatePayload()
  const bag = pluginName
    ? getPluginUserState<QueueThemeUserGameState>(payload?.pluginUserState, pluginName)
    : null
  const theme = bag?.theme?.trim() || null
  const isDecoy = bag?.isDecoy === true
  const roundActive = store?.roundActive === true

  if (!roundActive || !theme) {
    return null
  }

  return (
    <Box
      w="full"
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      bg="bg.subtle"
      px={3}
      py={2}
    >
      <VStack align="stretch" gap={1}>
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
          {isDecoy ? "Decoy theme" : "Theme"}
        </Text>
        <Text fontSize="sm" color="fg">
          {theme}
        </Text>
      </VStack>
    </Box>
  )
}
