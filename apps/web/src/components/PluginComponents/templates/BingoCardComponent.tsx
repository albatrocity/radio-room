import { Box, Grid, Text, VStack } from "@chakra-ui/react"
import type { PlaylistBingoUserGameState } from "@repo/types"
import type { BingoCardComponentProps } from "../../../types/PluginComponent"
import { useUserGameState } from "../../Modals/UserGameStateContext"
import { usePluginComponentContext } from "../context"

type Props = BingoCardComponentProps

/**
 * Renders the current user's Playlist Bingo card from `pluginUserState` (ADR 0094).
 */
export function BingoCardTemplateComponent(_props: Props) {
  const { pluginName } = usePluginComponentContext()!
  const gameState = useUserGameState()
  const bag = gameState?.getPluginState<PlaylistBingoUserGameState>(pluginName) ?? null
  const card = bag?.card ?? null

  if (!card) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No bingo card yet. Wait for a host to start a bingo round.
      </Text>
    )
  }

  const cellsByPos = new Map(card.cells.map((c) => [`${c.r},${c.c}`, c]))

  return (
    <VStack align="stretch" gap={3} w="full">
      {card.status === "locked" ? (
        <Text fontSize="sm" color="fg.muted">
          You got bingo — you&apos;re out for the rest of this round.
        </Text>
      ) : null}
      {card.status === "won" ? (
        <Text fontSize="sm" fontWeight="semibold" color="fg">
          BINGO!
        </Text>
      ) : null}
      <Grid templateColumns="repeat(5, 1fr)" gap={1} w="full">
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 5 }, (_, c) => {
            const cell = cellsByPos.get(`${r},${c}`)
            const marked = cell?.marked || cell?.free
            return (
              <Box
                key={`${r}-${c}`}
                minH="4.5rem"
                p={1}
                borderWidth="1px"
                borderColor={marked ? "green.solid" : "border"}
                bg={marked ? "green.subtle" : "bg.subtle"}
                borderRadius="md"
                display="flex"
                alignItems="center"
                justifyContent="center"
                textAlign="center"
              >
                <Text
                  fontSize="2xs"
                  lineHeight="short"
                  fontWeight={cell?.free ? "bold" : "medium"}
                  color={marked ? "fg" : "fg.muted"}
                >
                  {cell?.label ?? "—"}
                </Text>
              </Box>
            )
          }),
        )}
      </Grid>
    </VStack>
  )
}
