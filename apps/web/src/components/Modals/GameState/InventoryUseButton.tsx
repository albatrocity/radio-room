import { Box, Button } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { InventoryTargetUserPopover } from "./TargetUserPicker"
import { InventoryUseQueueItemPicker } from "./QueueItemPicker"
import { InventoryItemStoragePopover } from "./InventoryItemPicker"
import { CoinAmountStoragePopover } from "./CoinAmountPicker"
import { UserInventoryItemPicker } from "./UserInventoryItemPicker"
import { UseTargetPopover } from "./UseTargetPicker"

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
  fullWidth?: boolean
}

/** Must be a plain element — Popover.Trigger `asChild` cannot merge through a wrapper component. */
function useTriggerButton(loading: boolean, onClick?: () => void, fullWidth = true) {
  return (
    <Button
      size="sm"
      width={fullWidth ? "full" : undefined}
      variant="solid"
      colorPalette="action"
      loading={loading}
      onClick={onClick}
    >
      Use
    </Button>
  )
}

function wrapFullWidth(fullWidth: boolean, node: React.ReactNode) {
  if (!fullWidth) return node
  return <Box w="full">{node}</Box>
}

export function InventoryUseButton({
  itemId,
  requiresTarget,
  allItems,
  definitionMap,
  coinBalance,
  useLoading,
  onUse,
  fullWidth = true,
}: InventoryUseButtonProps) {
  switch (requiresTarget) {
    case "queueItem":
      return wrapFullWidth(
        fullWidth,
        <InventoryUseQueueItemPicker onPick={(targetQueueItemId) => onUse({ targetQueueItemId })}>
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </InventoryUseQueueItemPicker>,
      )
    case "user":
      return (
        <InventoryTargetUserPopover
          fullWidth={fullWidth}
          size="sm"
          onPick={(targetUserId) => onUse({ targetUserId })}
        >
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </InventoryTargetUserPopover>
      )
    case "userInventoryItem":
      return wrapFullWidth(
        fullWidth,
        <UserInventoryItemPicker
          itemId={itemId}
          fullWidth={fullWidth}
          onConfirm={(targetUserId, targetInventoryItemId) =>
            onUse({ targetUserId, targetInventoryItemId })
          }
        >
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </UserInventoryItemPicker>,
      )
    case "inventoryItem":
      return wrapFullWidth(
        fullWidth,
        <InventoryItemStoragePopover
          excludingItemId={itemId}
          items={allItems}
          definitionMap={definitionMap}
          onConfirm={(targetInventoryItemId, password) =>
            onUse({ targetInventoryItemId, password })
          }
        >
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </InventoryItemStoragePopover>,
      )
    case "mediaItem":
      return wrapFullWidth(
        fullWidth,
        <UseTargetPopover
          excludingItemId={itemId}
          items={allItems}
          definitionMap={definitionMap}
          onPick={(targetInventoryItemId) => onUse({ targetInventoryItemId })}
        >
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </UseTargetPopover>,
      )
    case "coinAmount":
      return wrapFullWidth(
        fullWidth,
        <CoinAmountStoragePopover
          maxCoins={Math.max(0, Math.floor(coinBalance))}
          onConfirm={(coinAmount, password) => onUse({ coinAmount, password })}
        >
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </CoinAmountStoragePopover>,
      )
    default:
      return useTriggerButton(useLoading, () => onUse(), fullWidth)
  }
}
