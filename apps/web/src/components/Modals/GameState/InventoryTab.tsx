import { useState } from "react"
import { Badge, Box, Center, HStack, Heading, Stack, Text, VStack } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { resolveItemRarity } from "@repo/game-logic"
import { emitToSocket } from "../../../actors/socketActor"
import { useSocketResultHandle } from "../../../lib/subscribeForSocketResult"
import ItemArtwork from "../../ItemArtwork"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../artworkFrames/frameStyles"
import { toaster } from "../../ui/toaster"
import { InventoryUseButton } from "./InventoryUseButton"
import { ItemRarityTag } from "../../PluginComponents/ItemRarityTag"
import ItemDetailListItem, { itemDetailListItemFrameProps } from "./ItemDetailListItem"
import { buildItemDetailFrame } from "./itemDetailFrame"
import { useOpenItemDetail } from "./useOpenItemDetail"
import InventoryGiftSellControls from "./InventoryGiftSellControls"

interface InventoryTabProps {
  items: InventoryItem[]
  maxSlots: number
  maxCollectionSlots: number
  definitionMap: Map<string, ItemDefinition>
  coinBalance: number
}

interface InventoryRowProps {
  item: InventoryItem
  definition?: ItemDefinition
  allItems: InventoryItem[]
  definitionMap: Map<string, ItemDefinition>
  coinBalance: number
}

/** Track per-item use-action loading state without re-rendering the whole tab. */
type PendingUse = { itemId: string } | null

function EmptyInventorySlot() {
  return (
    <HStack {...itemDetailListItemFrameProps}>
      <Center width="full" height="full">
        <Text color="actionBg/60" fontSize="sm">
          Empty
        </Text>
      </Center>
    </HStack>
  )
}

function InventoryRow({
  item,
  definition,
  allItems,
  definitionMap,
  coinBalance,
}: InventoryRowProps) {
  const openDetail = useOpenItemDetail("inventory")
  const name = definition?.name ?? item.definitionId
  const description = definition?.description
  const consumable = definition?.consumable ?? false
  const detailView = definition?.detailView
  const isCollection = definition?.slotPool === "collection"
  const opensDetail = Boolean(detailView && definition?.shortId)

  const [pendingUse, setPendingUse] = useState<PendingUse>(null)
  const { subscribe } = useSocketResultHandle()

  const dispatchUse = (extra?: {
    targetUserId?: string
    targetQueueItemId?: string
    targetInventoryItemId?: string
    password?: string
    coinAmount?: number
  }) => {
    setPendingUse({ itemId: item.itemId })
    subscribe<{ success: boolean; title?: string; message?: string }>({
      id: `inventory-use-${item.itemId}-${Date.now()}`,
      eventType: "INVENTORY_ACTION_RESULT",
      onResult: (data) => {
        setPendingUse(null)
        const blocked =
          !data.success &&
          typeof data.message === "string" &&
          data.message.toLowerCase().includes("blocked")
        toaster.create({
          title: data.title ?? (data.success ? "Success" : blocked ? "Blocked" : "Error"),
          description: data.message || (data.success ? "Action completed" : "Action failed"),
          type: data.success ? "success" : blocked ? "warning" : "error",
        })
      },
      onTimeout: () => setPendingUse(null),
    })

    emitToSocket("USE_INVENTORY_ITEM", {
      itemId: item.itemId,
      ...(extra?.targetUserId != null ? { targetUserId: extra.targetUserId } : {}),
      ...(extra?.targetQueueItemId != null ? { targetQueueItemId: extra.targetQueueItemId } : {}),
      ...(extra?.targetInventoryItemId != null
        ? { targetInventoryItemId: extra.targetInventoryItemId }
        : {}),
      ...(extra?.password != null ? { password: extra.password } : {}),
      ...(extra?.coinAmount != null ? { coinAmount: extra.coinAmount } : {}),
    })
  }

  const handleDetails = () => {
    if (!definition?.shortId || !detailView) return
    openDetail(
      buildItemDetailFrame({
        shortId: definition.shortId,
        title: name,
        source: "inventory",
        detailView,
        definitionId: definition.id,
        inventoryItemId: item.itemId,
      }),
    )
  }

  const showRowActions = !isCollection || !opensDetail
  const trailing = showRowActions ? (
    <Stack direction="column" gap={1} align="stretch" w="fit-content">
      {consumable && (
        <InventoryUseButton
          itemId={item.itemId}
          requiresTarget={definition?.requiresTarget}
          allItems={allItems}
          definitionMap={definitionMap}
          coinBalance={coinBalance}
          useLoading={pendingUse?.itemId === item.itemId}
          onUse={dispatchUse}
          fullWidth
        />
      )}
      <InventoryGiftSellControls item={item} definition={definition} size="sm" />
    </Stack>
  ) : undefined

  return (
    <ItemDetailListItem
      artwork={
        <VStack align="center" minW="4rem" gap={1}>
          <ItemArtwork
            imageUrl={definition?.imageUrl}
            imageUrlLarge={definition?.imageUrlLarge}
            icon={definition?.icon}
            rarity={definition?.rarity}
            artworkFrame={definition?.artworkFrame}
            boxSize={isCollection ? FRAMED_ARTWORK_BOX_SIZE : 7}
            alt={name}
            interactive={!opensDetail}
          />
          {definition != null && (
            <ItemRarityTag size={["xs", "sm"]} rarity={resolveItemRarity(definition)} />
          )}
        </VStack>
      }
      name={name}
      titleAddon={
        item.quantity > 1 ? (
          <Badge size="sm" variant="subtle">
            ×{item.quantity}
          </Badge>
        ) : undefined
      }
      subtitle={definition?.artist?.trim() || undefined}
      description={description}
      onOpen={opensDetail ? handleDetails : undefined}
      openLabel={detailView?.actionLabel}
      trailing={trailing}
    />
  )
}

function InventoryTab({
  items,
  maxSlots,
  maxCollectionSlots,
  definitionMap,
  coinBalance,
}: InventoryTabProps) {
  const inventoryItems = items.filter(
    (item) => (definitionMap.get(item.definitionId)?.slotPool ?? "inventory") !== "collection",
  )
  const collectionItems = items.filter(
    (item) => definitionMap.get(item.definitionId)?.slotPool === "collection",
  )
  const emptyInventory = maxSlots > 0 ? Math.max(0, maxSlots - inventoryItems.length) : 0
  const showInventoryGrid = maxSlots > 0
  const showCollection = collectionItems.length > 0

  return (
    <Box>
      <HStack justify="space-between" align="baseline" mb={2}>
        <Heading size="sm">Inventory</Heading>
        <HStack gap={2}>
          {showInventoryGrid && (
            <Text fontSize="xs" color="fg.muted">
              {inventoryItems.length} / {maxSlots} slots
            </Text>
          )}
        </HStack>
      </HStack>

      {!showInventoryGrid && inventoryItems.length === 0 && (
        <Text fontSize="sm" color="fg.muted">
          Your inventory is empty.
        </Text>
      )}

      {(inventoryItems.length > 0 || showInventoryGrid) && (
        <Stack gap={2}>
          {inventoryItems.map((item) => (
            <InventoryRow
              key={item.itemId}
              item={item}
              definition={definitionMap.get(item.definitionId)}
              allItems={items}
              definitionMap={definitionMap}
              coinBalance={coinBalance}
            />
          ))}
          {showInventoryGrid &&
            Array.from({ length: emptyInventory }).map((_, i) => (
              <EmptyInventorySlot key={`empty-inv-${i}`} />
            ))}
        </Stack>
      )}

      {showCollection && (
        <Box mt={6}>
          <HStack justify="space-between" align="baseline" mb={2}>
            <Heading size="sm">Collection</Heading>
            {maxCollectionSlots > 0 && (
              <Text fontSize="xs" color="fg.muted">
                {collectionItems.length} / {maxCollectionSlots} slots
              </Text>
            )}
          </HStack>
          <Stack gap={2}>
            {collectionItems.map((item) => (
              <InventoryRow
                key={item.itemId}
                item={item}
                definition={definitionMap.get(item.definitionId)}
                allItems={items}
                definitionMap={definitionMap}
                coinBalance={coinBalance}
              />
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  )
}

export default InventoryTab
