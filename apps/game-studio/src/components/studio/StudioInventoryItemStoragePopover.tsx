"use client"

import { Button, Input, Popover, Stack, Text, VStack } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { useState } from "react"
import type { StudioRoom } from "../../studio/studioRoom"

const STORAGE_SHORT_IDS = new Set(["van-cubby", "merch-cash-box"])

type Props = {
  room: StudioRoom
  userId: string
  excludingItemId: string
  onConfirm: (targetInventoryItemId: string, password: string) => void
  children: React.ReactNode
}

/**
 * Pick another inventory stack to store in Van Cubby, then enter a password (Game Studio).
 */
export function StudioInventoryItemStoragePopover({
  room,
  userId,
  excludingItemId,
  onConfirm,
  children,
}: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"pick" | "lock">("pick")
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [password, setPassword] = useState("")

  const items = room.getInventory(userId)

  const selectable = items.filter((invItem: InventoryItem) => {
    if (invItem.itemId === excludingItemId) return false
    const def = room.getDefinition(invItem.definitionId)
    if (def?.shortId && STORAGE_SHORT_IDS.has(def.shortId)) return false
    return true
  })

  const reset = () => {
    setStep("pick")
    setPickedId(null)
    setPassword("")
  }

  const handleOpenChange = (e: { open: boolean }) => {
    setOpen(e.open)
    if (!e.open) reset()
  }

  const chooseItem = (targetInventoryItemId: string) => {
    setPickedId(targetInventoryItemId)
    setStep("lock")
  }

  const submit = () => {
    if (!pickedId || !password.trim()) return
    const id = pickedId
    const pw = password
    setOpen(false)
    reset()
    onConfirm(id, pw)
  }

  const pickedLabel =
    pickedId != null
      ? (() => {
          const row = items.find((i) => i.itemId === pickedId)
          const def = row ? room.getDefinition(row.definitionId) : null
          return def?.name ?? row?.definitionId ?? "Item"
        })()
      : ""

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange} lazyMount>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content minW="260px" p={3}>
          {step === "pick" ? (
            <>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Store which item?
              </Text>
              {selectable.length === 0 ? (
                <Text fontSize="xs" color="fg.muted">
                  No other items to store.
                </Text>
              ) : (
                <VStack align="stretch" gap={1}>
                  {selectable.map((invItem: InventoryItem) => {
                    const def: ItemDefinition | null = room.getDefinition(invItem.definitionId)
                    const label = def?.name ?? invItem.definitionId
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
                      </Button>
                    )
                  })}
                </VStack>
              )}
            </>
          ) : (
            <Stack gap={2}>
              <Text fontSize="sm">
                Locking: <strong>{pickedLabel}</strong>
              </Text>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Button size="xs" onClick={submit} disabled={!password.trim()}>
                Store in cubby
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setStep("pick")}>
                Back
              </Button>
            </Stack>
          )}
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
