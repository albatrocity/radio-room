import { useState } from "react"
import { Box, Button } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { InventoryTargetUserPopover } from "./TargetUserPicker"
import { InventoryUseQueueItemPicker } from "./QueueItemPicker"
import { InventoryUseStashTargetPicker } from "./StashTargetPicker"
import { InventoryItemStoragePopover } from "./InventoryItemPicker"
import { UserInventoryItemPicker } from "./UserInventoryItemPicker"
import { UseTargetPopover } from "./UseTargetPicker"
import { ItemUseFormPopover } from "./ItemUseFormPopover"
import {
  type InventoryUseExtra,
  type TargetThenFormPhase,
  advanceTargetThenForm,
  hasItemUseForm,
  mergeTargetAndFormValues,
  shouldPickTargetThenForm,
} from "./inventoryUseCompose"

type UseExtra = InventoryUseExtra

interface InventoryUseButtonProps {
  itemId: string
  requiresTarget?: ItemDefinition["requiresTarget"]
  /** Full definition — used for declarative `useForm` (ADR 0187 / 0193). */
  definition?: ItemDefinition
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

/**
 * Entity picker → declarative `useForm` (ADR 0193). After the target is chosen,
 * swaps to a controlled form popover anchored on the same Use button.
 */
function TargetThenFormUse({
  itemId,
  requiresTarget,
  useForm,
  allItems,
  definitionMap,
  coinBalance,
  useLoading,
  onUse,
  fullWidth,
}: {
  itemId: string
  requiresTarget: NonNullable<ItemDefinition["requiresTarget"]>
  useForm: NonNullable<ItemDefinition["useForm"]>
  allItems: InventoryItem[]
  definitionMap: Map<string, ItemDefinition>
  coinBalance: number
  useLoading: boolean
  onUse: (extra?: UseExtra) => void
  fullWidth: boolean
}) {
  const [phase, setPhase] = useState<TargetThenFormPhase>("pick")
  const [pendingTarget, setPendingTarget] = useState<UseExtra | null>(null)
  const formOpen = phase === "form" && pendingTarget != null
  const trigger = useTriggerButton(useLoading, undefined, fullWidth)

  const beginForm = (extra: UseExtra) => {
    setPendingTarget(extra)
    setPhase((current) => advanceTargetThenForm(current, { type: "TARGET_PICKED" }))
  }

  const endForm = (event: "FORM_CLOSED" | "FORM_CONFIRMED") => {
    setPendingTarget(null)
    setPhase((current) => advanceTargetThenForm(current, { type: event }))
  }

  const formPopover = (
    <ItemUseFormPopover
      fields={useForm}
      coinBalance={coinBalance}
      open={formOpen}
      onOpenChange={(open) => {
        if (!open) endForm("FORM_CLOSED")
      }}
      onConfirm={(formValues) => {
        if (!pendingTarget) return
        const merged = mergeTargetAndFormValues(pendingTarget, formValues)
        endForm("FORM_CONFIRMED")
        onUse(merged)
      }}
    >
      {trigger}
    </ItemUseFormPopover>
  )

  if (formOpen) {
    return wrapFullWidth(fullWidth, formPopover)
  }

  switch (requiresTarget) {
    case "queueItem":
      return wrapFullWidth(
        fullWidth,
        <InventoryUseQueueItemPicker onPick={(targetQueueItemId) => beginForm({ targetQueueItemId })}>
          {trigger}
        </InventoryUseQueueItemPicker>,
      )
    case "storedArtifact":
      return wrapFullWidth(
        fullWidth,
        <InventoryUseStashTargetPicker
          definitionMap={definitionMap}
          onPick={(targetArtifactId) => beginForm({ targetArtifactId })}
        >
          {trigger}
        </InventoryUseStashTargetPicker>,
      )
    case "user":
      return (
        <InventoryTargetUserPopover
          fullWidth={fullWidth}
          size="sm"
          onPick={(targetUserId) => beginForm({ targetUserId })}
        >
          {trigger}
        </InventoryTargetUserPopover>
      )
    case "userInventoryItem":
      return wrapFullWidth(
        fullWidth,
        <UserInventoryItemPicker
          itemId={itemId}
          fullWidth={fullWidth}
          onConfirm={(targetUserId, targetInventoryItemId) =>
            beginForm({ targetUserId, targetInventoryItemId })
          }
        >
          {trigger}
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
          onConfirm={(targetInventoryItemIds) => beginForm({ targetInventoryItemIds })}
        >
          {trigger}
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
          onPick={(targetInventoryItemId) => beginForm({ targetInventoryItemId })}
        >
          {trigger}
        </UseTargetPopover>,
      )
    default:
      return wrapFullWidth(fullWidth, formPopover)
  }
}

export function InventoryUseButton({
  itemId,
  requiresTarget,
  definition,
  allItems,
  definitionMap,
  coinBalance,
  useLoading,
  onUse,
  fullWidth = true,
}: InventoryUseButtonProps) {
  const useForm = definition?.useForm

  if (requiresTarget && shouldPickTargetThenForm(requiresTarget, definition) && useForm) {
    return (
      <TargetThenFormUse
        itemId={itemId}
        requiresTarget={requiresTarget}
        useForm={useForm}
        allItems={allItems}
        definitionMap={definitionMap}
        coinBalance={coinBalance}
        useLoading={useLoading}
        onUse={onUse}
        fullWidth={fullWidth}
      />
    )
  }

  if (hasItemUseForm(definition) && useForm) {
    return wrapFullWidth(
      fullWidth,
      <ItemUseFormPopover
        fields={useForm}
        coinBalance={coinBalance}
        onConfirm={(formValues) => onUse({ formValues })}
      >
        {useTriggerButton(useLoading, undefined, fullWidth)}
      </ItemUseFormPopover>,
    )
  }

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
          onConfirm={(targetInventoryItemIds) => onUse({ targetInventoryItemIds })}
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
    default:
      return useTriggerButton(useLoading, () => onUse(), fullWidth)
  }
}
