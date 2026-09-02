import { Box, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import type { GameAttributeName, InventoryItem, ItemDefinition } from "@repo/types"
import { useUserGameState } from "../UserGameStateContext"
import InventoryTab from "./InventoryTab"

function attributeLabel(attribute: GameAttributeName): string {
  if (attribute === "score") return "Score"
  if (attribute === "coin") return "Coins"
  if (attribute.includes(":")) {
    const [pluginName, name] = attribute.split(":")
    const pretty = (s: string) =>
      s
        .split("-")
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ""))
        .join(" ")
    return `${pretty(pluginName ?? "")} · ${pretty(name ?? "")}`
  }
  return attribute
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

const EMPTY_INVENTORY_ITEMS: InventoryItem[] = []
const EMPTY_ATTRIBUTES = {} as Record<GameAttributeName, number>
const EMPTY_DEFINITION_MAP = new Map<string, ItemDefinition>()

function GameStateInventoryContent() {
  const gameState = useUserGameState()
  const enabledAttributes = gameState?.session?.config.enabledAttributes ?? []
  const attributes = (gameState?.state?.attributes ?? EMPTY_ATTRIBUTES) as Record<
    GameAttributeName,
    number
  >
  const inventoryEnabled = gameState?.session?.config.inventoryEnabled ?? false
  const rawInventoryItems = gameState?.inventory?.items
  const inventoryItems =
    rawInventoryItems && rawInventoryItems.length > 0 ? rawInventoryItems : EMPTY_INVENTORY_ITEMS
  const maxSlots = gameState?.inventory?.maxSlots ?? 0
  const maxCollectionSlots = gameState?.inventory?.maxCollectionSlots ?? 0
  const definitionMap = gameState?.definitionMap ?? EMPTY_DEFINITION_MAP

  const enabledAttributesForGrid = enabledAttributes.filter((a) => a !== "score" && a !== "coin")

  return (
    <Stack gap={5} pt={2}>
      {enabledAttributesForGrid.length > 0 && (
        <Box>
          <Heading size="sm" mb={2}>
            Stats
          </Heading>
          <SimpleGrid columns={{ base: 2, sm: 3 }} gap={3}>
            {enabledAttributesForGrid.map((attr) => (
              <Box
                key={attr}
                borderWidth="1px"
                borderColor="border.muted"
                borderRadius="md"
                p={3}
                bg="bg.subtle"
              >
                <Text fontSize="xs" color="fg.muted">
                  {attributeLabel(attr)}
                </Text>
                <Text fontSize="2xl" fontWeight="semibold">
                  {formatNumber(attributes[attr] ?? 0)}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
        </Box>
      )}

      {inventoryEnabled && (
        <InventoryTab
          items={inventoryItems}
          maxSlots={maxSlots}
          maxCollectionSlots={maxCollectionSlots}
          definitionMap={definitionMap}
          coinBalance={attributes.coin ?? 0}
        />
      )}
    </Stack>
  )
}

export default GameStateInventoryContent
