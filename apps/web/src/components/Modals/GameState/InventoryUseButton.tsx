import { Button } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { InventoryTargetUserPopover } from "./TargetUserPicker"
import { InventoryUseQueueItemPicker } from "./QueueItemPicker"
import { InventoryItemStoragePopover } from "./InventoryItemPicker"
import { CoinAmountStoragePopover } from "./CoinAmountPicker"

type UseExtra = {
  targetUserId?: string
  targetQueueItemId?: string
  targetInventoryItemId?: string
  password?: string
  coinAmount?: number
}

interface InventoryUseButtonProps {
  itemId: string
  requiresTarget?: ItemDefinition["requiresTarget"]
  allItems: InventoryItem[]
  definitionMap: Map<string, ItemDefinition>
  coinBalance: number
  useLoading: boolean
  onUse: (extra?: UseExtra) => void
}

/** Must be a plain element — Popover.Trigger `asChild` cannot merge through a wrapper component. */
function useTriggerButton(loading: boolean, onClick?: () => void) {
  return (
    <Button
      size="xs"
      width="full"
      variant="solid"
      colorPalette="action"
      loading={loading}
      onClick={onClick}
    >
      Use
    </Button>
  )
}

export function InventoryUseButton({
  itemId,
  requiresTarget,
  allItems,
  definitionMap,
  coinBalance,
  useLoading,
  onUse,
}: InventoryUseButtonProps) {
  switch (requiresTarget) {
    case "queueItem":
      return (
        <InventoryUseQueueItemPicker onPick={(targetQueueItemId) => onUse({ targetQueueItemId })}>
          {useTriggerButton(useLoading)}
        </InventoryUseQueueItemPicker>
      )
    case "user":
      return (
        <InventoryTargetUserPopover onPick={(targetUserId) => onUse({ targetUserId })}>
          {useTriggerButton(useLoading)}
        </InventoryTargetUserPopover>
      )
    case "inventoryItem":
      return (
        <InventoryItemStoragePopover
          excludingItemId={itemId}
          items={allItems}
          definitionMap={definitionMap}
          onConfirm={(targetInventoryItemId, password) =>
            onUse({ targetInventoryItemId, password })
          }
        >
          {useTriggerButton(useLoading)}
        </InventoryItemStoragePopover>
      )
    case "coinAmount":
      return (
        <CoinAmountStoragePopover
          maxCoins={Math.max(0, Math.floor(coinBalance))}
          onConfirm={(coinAmount, password) => onUse({ coinAmount, password })}
        >
          {useTriggerButton(useLoading)}
        </CoinAmountStoragePopover>
      )
    default:
      return useTriggerButton(useLoading, () => onUse())
  }
}
