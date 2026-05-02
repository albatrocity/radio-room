import { Box, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import type { GameAttributeName, InventoryItem, ItemDefinition } from "@repo/types"
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

interface GameStateInventoryContentProps {
  enabledAttributes: GameAttributeName[]
  attributes: Record<GameAttributeName, number>
  inventoryEnabled: boolean
  inventoryItems: InventoryItem[]
  maxSlots: number
  definitionMap: Map<string, ItemDefinition>
}

function GameStateInventoryContent({
  enabledAttributes,
  attributes,
  inventoryEnabled,
  inventoryItems,
  maxSlots,
  definitionMap,
}: GameStateInventoryContentProps) {
  const enabledAttributesForGrid = enabledAttributes.filter(
    (a) => a !== "score" && a !== "coin",
  )

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
          definitionMap={definitionMap}
        />
      )}
    </Stack>
  )
}

export default GameStateInventoryContent
