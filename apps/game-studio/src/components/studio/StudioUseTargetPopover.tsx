"use client"

import { Badge, Button, HStack, Popover, Text, VStack } from "@chakra-ui/react"
import type { InventoryItem } from "@repo/types"
import {
  isPhysicalMediaDefinition,
  MEDIA_CONDITION_LABELS,
  MEDIA_CONDITION_PALETTE,
  readItemCondition,
} from "@repo/types"
import { useState } from "react"
import type { StudioRoom } from "../../studio/studioRoom"

type Props = {
  room: StudioRoom
  userId: string
  excludingItemId: string
  onPick: (targetInventoryItemId: string) => void
  children: React.ReactNode
}

/**
 * Pick any of the user's own stacks to use an item on (Game Studio).
 */
export function StudioUseTargetPopover({ room, userId, excludingItemId, onPick, children }: Props) {
  const [open, setOpen] = useState(false)
  const items = room.getInventory(userId)
  const selectable = items.filter((invItem: InventoryItem) => invItem.itemId !== excludingItemId)

  const choose = (targetInventoryItemId: string) => {
    setOpen(false)
    onPick(targetInventoryItemId)
  }

  return (
    <Popover.Root open={open} onOpenChange={(e) => setOpen(e.open)} lazyMount>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content minW="260px" maxH="min(360px, 60vh)" overflowY="auto" p={3}>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Use on…
          </Text>
          {selectable.length === 0 ? (
            <Text fontSize="xs" color="fg.muted">
              Nothing to use it on.
            </Text>
          ) : (
            <VStack align="stretch" gap={1}>
              {selectable.map((invItem: InventoryItem) => {
                const def = room.getDefinition(invItem.definitionId)
                const label = def?.name ?? invItem.definitionId
                const condition = isPhysicalMediaDefinition(def) ? readItemCondition(invItem) : undefined
                const format = isPhysicalMediaDefinition(def) ? def?.mediaFormat : undefined
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
                      {isPhysicalMediaDefinition(def) ? (
                        <HStack gap={1} flexShrink={0}>
                          {format ? (
                            <Text fontSize="2xs" color="fg.muted">
                              {format}
                            </Text>
                          ) : null}
                          {condition ? (
                            <Badge
                              size="sm"
                              colorPalette={MEDIA_CONDITION_PALETTE[condition]}
                              variant="subtle"
                            >
                              {MEDIA_CONDITION_LABELS[condition]}
                            </Badge>
                          ) : null}
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
