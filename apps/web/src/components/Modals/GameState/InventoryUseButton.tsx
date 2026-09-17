import { Box, Button } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { InventoryTargetUserPopover } from "./TargetUserPicker"
import { InventoryUseQueueItemPicker } from "./QueueItemPicker"
import { InventoryUseStashTargetPicker } from "./StashTargetPicker"
import { InventoryItemStoragePopover } from "./InventoryItemPicker"
import { CoinAmountStoragePopover } from "./CoinAmountPicker"
import { UserInventoryItemPicker } from "./UserInventoryItemPicker"
import { UseTargetPopover } from "./UseTargetPicker"
import { SpokenMessagePopover } from "./SpokenMessagePicker"

type UseExtra = {
  targetUserId?: string
  targetQueueItemId?: string
  targetArtifactId?: string
  targetInventoryItemId?: string
  targetInventoryItemIds?: string[]
  password?: string
  coinAmount?: number
  message?: string
  voice?: string
  label?: string
  note?: string
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
    case "storedArtifact":
      return wrapFullWidth(
        fullWidth,
        <InventoryUseStashTargetPicker
          definitionMap={definitionMap}
          onPick={(targetArtifactId) => onUse({ targetArtifactId })}
        >
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </InventoryUseStashTargetPicker>,
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
    case "inventoryItems": {
      const acting = allItems.find((row) => row.itemId === itemId)
      const actingDef = acting ? definitionMap.get(acting.definitionId) : undefined
      return wrapFullWidth(
        fullWidth,
        <InventoryItemStoragePopover
          excludingItemId={itemId}
          items={allItems}
          definitionMap={definitionMap}
          capacity={actingDef?.storageCapacity ?? 1}
          onConfirm={(targetInventoryItemIds, password, label, note) =>
            onUse({ targetInventoryItemIds, password, label, note })
          }
        >
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </InventoryItemStoragePopover>,
      )
    }
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
          onConfirm={(coinAmount, password, label, note) =>
            onUse({ coinAmount, password, label, note })
          }
        >
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </CoinAmountStoragePopover>,
      )
    case "spokenMessage":
      return wrapFullWidth(
        fullWidth,
        <SpokenMessagePopover
          onConfirm={(message, voice) => onUse({ message, voice })}
        >
          {useTriggerButton(useLoading, undefined, fullWidth)}
        </SpokenMessagePopover>,
      )
    default:
      return useTriggerButton(useLoading, () => onUse(), fullWidth)
  }
}
