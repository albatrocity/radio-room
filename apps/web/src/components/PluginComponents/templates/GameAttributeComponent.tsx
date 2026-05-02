import { Box, HStack, Icon, Text } from "@chakra-ui/react"
import type { GameAttributeComponentProps, GameAttributeName } from "@repo/types"
import { getIcon } from "../icons"
import { useUserGameState } from "../../Modals/UserGameStateContext"

const NUMBER_FORMAT = new Intl.NumberFormat()

/**
 * Display a single game attribute (e.g. `coin`, `score`) for the current
 * user. Reads from `UserGameStateContext` provided by `ModalUserGameState`,
 * so this only renders meaningful values inside the game state modal (or
 * any other surface that wraps content with `UserGameStateContext`).
 *
 * Renders nothing when there's no game state context available, to avoid
 * showing stale zeros outside the modal.
 */
export function GameAttributeTemplateComponent({
  attribute,
  format = "number",
  icon,
  label,
}: GameAttributeComponentProps) {
  const gameState = useUserGameState()
  if (!gameState) return null

  const value = gameState.getAttribute(attribute as GameAttributeName)
  const IconComponent = icon ? getIcon(icon) : undefined

  const formatted = format === "currency" ? NUMBER_FORMAT.format(value) : NUMBER_FORMAT.format(value)

  return (
    <Box
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      px={3}
      py={2}
      bg="bg.subtle"
    >
      <HStack gap={2} align="center">
        {IconComponent ? <Icon as={IconComponent} fontSize="lg" color="fg.muted" /> : null}
        <Box>
          {label && (
            <Text fontSize="xs" color="fg.muted">
              {label}
            </Text>
          )}
          <Text fontSize="lg" fontWeight="semibold">
            {formatted}
          </Text>
        </Box>
      </HStack>
    </Box>
  )
}
