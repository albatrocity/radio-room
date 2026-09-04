import { useState } from "react"
import { Button, HStack, Popover, Text, VStack } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition, MediaCondition } from "@repo/types"
import { isMediaCondition, PHYSICAL_MEDIA_CONDITION_KEY } from "@repo/types"
import { MediaConditionTag } from "../../PluginComponents/MediaConditionTag"

function isPhysicalMedia(definition: ItemDefinition | undefined): boolean {
  return definition?.mediaFormat != null || definition?.artworkFrame != null
}

function readCondition(item: InventoryItem): MediaCondition | undefined {
  const raw = item.metadata?.[PHYSICAL_MEDIA_CONDITION_KEY]
  return isMediaCondition(raw) ? raw : undefined
}

/**
 * Pick any of the user's own stacks (inventory or collection) to use an item on.
 */
export function UseTargetPopover({
  children,
  excludingItemId,
  items,
  definitionMap,
  onPick,
}: {
  children: React.ReactNode
  excludingItemId: string
  items: InventoryItem[]
  definitionMap: Map<string, ItemDefinition>
  onPick: (targetInventoryItemId: string) => void
}) {
  const [open, setOpen] = useState(false)

  const selectable = items.filter((invItem) => invItem.itemId !== excludingItemId)

  const choose = (targetInventoryItemId: string) => {
    setOpen(false)
    onPick(targetInventoryItemId)
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      lazyMount
      portalled={false}
      positioning={{ placement: "bottom-end", strategy: "fixed" }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content
          css={{ "--popover-bg": "{colors.appBg}" }}
          minW="260px"
          maxH="min(360px, 60vh)"
          overflowY="auto"
          p={3}
        >
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Use on…
          </Text>
          {selectable.length === 0 ? (
            <Text fontSize="xs" color="fg.muted">
              Nothing to use it on.
            </Text>
          ) : (
            <VStack align="stretch" gap={1}>
              {selectable.map((invItem) => {
                const def = definitionMap.get(invItem.definitionId)
                const label = def?.name ?? invItem.definitionId
                const condition = isPhysicalMedia(def) ? readCondition(invItem) : undefined
                const format = isPhysicalMedia(def) ? def?.mediaFormat : undefined
                return (
                  <Button
                    key={invItem.itemId}
                    size="xs"
                    variant="ghost"
                    justifyContent="flex-start"
                    onClick={() => choose(invItem.itemId)}
                  >
                    <HStack w="full" justify="space-between" gap={2} minW={0}>
                      <Text truncate>
                        {label}
                        {invItem.quantity > 1 ? ` ×${invItem.quantity}` : ""}
                      </Text>
                      {isPhysicalMedia(def) ? (
                        <HStack gap={1} flexShrink={0}>
                          {format ? (
                            <Text fontSize="2xs" color="fg.muted">
                              {format}
                            </Text>
                          ) : null}
                          {condition ? <MediaConditionTag condition={condition} size="xs" /> : null}
                        </HStack>
                      ) : null}
                    </HStack>
                  </Button>
                )
              })}
            </VStack>
          )}
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
