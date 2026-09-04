"use client"

import { Button, NativeSelect, Popover, Text, VStack } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { resolveSlotPool } from "@repo/types"
import { useMemo, useState } from "react"
import type { StudioRoom } from "../../studio/studioRoom"

type Props = {
  room: StudioRoom
  actorUserId: string
  defaultTargetUserId: string
  onConfirm: (targetUserId: string, targetInventoryItemId: string) => void
  children: React.ReactNode
}

/**
 * Steal flow (Game Studio): "Steal from…" user select + bag/collection list.
 */
export function StudioUserInventoryItemPopover({
  room,
  actorUserId,
  defaultTargetUserId,
  onConfirm,
  children,
}: Props) {
  const [open, setOpen] = useState(false)

  const others = useMemo(
    () => [...room.users.values()].filter((u) => u.userId !== actorUserId),
    [room.snapshotEpoch, actorUserId],
  )

  const initialTarget =
    others.some((u) => u.userId === defaultTargetUserId)
      ? defaultTargetUserId
      : (others[0]?.userId ?? defaultTargetUserId)

  const [targetUserId, setTargetUserId] = useState(initialTarget)

  const stealable = useMemo(() => {
    if (!targetUserId || targetUserId === actorUserId) return [] as InventoryItem[]
    return room.getInventory(targetUserId)
  }, [room.snapshotEpoch, targetUserId, actorUserId])

  const handleOpenChange = (e: { open: boolean }) => {
    setOpen(e.open)
    if (e.open) {
      setTargetUserId(
        others.some((u) => u.userId === defaultTargetUserId)
          ? defaultTargetUserId
          : (others[0]?.userId ?? defaultTargetUserId),
      )
    }
  }

  const chooseItem = (targetInventoryItemId: string) => {
    if (!targetUserId || targetUserId === actorUserId) return
    setOpen(false)
    onConfirm(targetUserId, targetInventoryItemId)
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange} lazyMount>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content minW="280px" p={3}>
          <VStack align="stretch" gap={2}>
            <Text fontSize="sm" fontWeight="semibold">
              Steal from…
            </Text>
            {others.length === 0 ? (
              <Text fontSize="xs" color="fg.muted">
                No other users in the room.
              </Text>
            ) : (
              <>
                <NativeSelect.Root size="xs">
                  <NativeSelect.Field
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                  >
                    {others.map((u) => (
                      <option key={u.userId} value={u.userId}>
                        {u.username}
                      </option>
                    ))}
                  </NativeSelect.Field>
                </NativeSelect.Root>
                {stealable.length === 0 ? (
                  <Text fontSize="xs" color="fg.muted">
                    They have nothing to steal.
                  </Text>
                ) : (
                  <VStack align="stretch" gap={1} maxH="min(50vh, 20rem)" overflowY="auto">
                    {stealable.map((invItem: InventoryItem) => {
                      const def: ItemDefinition | null = room.getDefinition(invItem.definitionId)
                      const label = def?.name ?? invItem.definitionId
                      const pool = resolveSlotPool(def)
                      return (
                        <Button
                          key={invItem.itemId}
                          size="xs"
                          variant="ghost"
                          justifyContent="flex-start"
                          onClick={() => chooseItem(invItem.itemId)}
                        >
                          {label}
                          {invItem.quantity > 1 ? ` ×${invItem.quantity}` : ""}
                          {pool !== "inventory" ? ` · ${pool}` : ""}
                        </Button>
                      )
                    })}
                  </VStack>
                )}
              </>
            )}
          </VStack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
