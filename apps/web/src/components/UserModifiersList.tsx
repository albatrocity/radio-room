import { HStack, Icon, List, Stack, Text } from "@chakra-ui/react"
import { GameStateModifier, ItemDefinition } from "@repo/types"
import { ComponentType, useMemo } from "react"
import { getIcon } from "./PluginComponents/icons"
import { CountdownTimer } from "./CountdownTimer"

interface UserModifiersListProps {
  modifiers: GameStateModifier[]
  definitionMap: Map<string, ItemDefinition>
}

function formatModifierName(name: string): string {
  return name.replace(/_/g, " ")
}

function resolveModifierIndicatorIcon(
  modifier: GameStateModifier,
  definitionMap: Map<string, ItemDefinition>,
): ComponentType {
  if (modifier.icon) {
    const fromModifier = getIcon(modifier.icon)
    if (fromModifier) return fromModifier
  }
  for (const effect of modifier.effects) {
    if (effect.icon) {
      const fromEffect = getIcon(effect.icon)
      if (fromEffect) return fromEffect
    }
  }
  if (modifier.itemDefinitionId) {
    const def = definitionMap.get(modifier.itemDefinitionId)
    if (def?.icon) {
      const fromItem = getIcon(def.icon)
      if (fromItem) return fromItem
    }
  }
  return getIcon("star")!
}

export function UserModifiersList({ modifiers, definitionMap }: UserModifiersListProps) {
  const activeModifiers = useMemo(() => {
    const now = Date.now()
    return (modifiers ?? []).filter((m) => m.startAt <= now && m.endAt > now && m.endAt > m.startAt)
  }, [modifiers])

  if (activeModifiers.length === 0) {
    return null
  }

  return (
    <Stack gap={1.5} width="full">
      <List.Root variant="plain">
        {activeModifiers.map((m) => (
          <List.Item as="li" key={m.id}>
            <List.Indicator asChild color="green.500">
              <Icon as={resolveModifierIndicatorIcon(m, definitionMap)} boxSize={4} />
            </List.Indicator>
            <HStack justify="space-between" width="full" gap={3}>
              <Text
                fontSize="sm"
                fontWeight="medium"
                color="secondaryText"
                textTransform="capitalize"
                flex={1}
                minW={0}
                truncate
              >
                {formatModifierName(m.name)}
              </Text>
              <HStack gap={0.5} flexShrink={0}>
                <CountdownTimer
                  start={m.startAt}
                  duration={m.endAt - m.startAt}
                  fontSize="sm"
                  fontWeight="semibold"
                />
                <Text fontSize="sm" fontWeight="semibold">
                  s
                </Text>
              </HStack>
            </HStack>
          </List.Item>
        ))}
      </List.Root>
    </Stack>
  )
}
