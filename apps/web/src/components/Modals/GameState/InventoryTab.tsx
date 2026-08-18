import { useEffect, useRef, useState } from "react"
import {
  Badge,
  Box,
  Button,
  Center,
  HStack,
  Heading,
  Icon,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition, ItemShopsUserGameState } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { resolveItemRarity } from "@repo/game-logic"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { useCanAddToQueue, useIsAdmin, useModalsSend, useMyMedia } from "../../../hooks/useActors"
import { quoteItemShopsSellCoins } from "../../../lib/itemShopsSellQuote"
import ItemArtwork from "../../ItemArtwork"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../artworkFrames/frameStyles"
import { getIcon } from "../../PluginComponents/icons"
import { toaster } from "../../ui/toaster"
import { useUserGameState } from "../UserGameStateContext"
import { InventoryUseButton } from "./InventoryUseButton"
import { ItemRarityTag } from "../../PluginComponents/ItemRarityTag"

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
  /** Physical Media shelf key when this item can be browsed in Add to Queue. */
  mediaKey?: string
}

/**
 * Shared frame for each slot (item or empty placeholder).
 * Uses `primary.*` semantic tokens so background and border follow the active app theme
 * (see `chakraTheme.ts` + `[data-theme]` on the document).
 */
const inventorySlotFrameProps = {
  align: "center" as const,
  gap: 4,
  borderWidth: "1px",
  borderColor: "primary.muted",
  borderRadius: "md",
  p: 3,
  bg: "primary.subtle/30",
  colorPalette: "primary" as const,
  layerStyle: "themeTransition" as const,
}

/** Track per-item action loading state without re-rendering the whole tab. */
type PendingAction = { itemId: string; action: "use" | "sell" } | null

function EmptyInventorySlot() {
  return (
    <HStack {...inventorySlotFrameProps}>
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
  mediaKey,
}: InventoryRowProps) {
  const gameState = useUserGameState()
  const modalSend = useModalsSend()
  const name = definition?.name ?? item.definitionId
  const description = definition?.description
  const consumable = definition?.consumable ?? false
  const tradeable = definition?.tradeable ?? false
  const coinValue = definition?.coinValue ?? 0
  const sellable = tradeable && coinValue > 0
  const isItemShopsItem = item.sourcePlugin === ITEM_SHOPS_PLUGIN_NAME
  const shopInstance =
    gameState?.getPluginState<ItemShopsUserGameState>(ITEM_SHOPS_PLUGIN_NAME)
      ?.currentShopInstance ?? null
  const shopVisitOpen = shopInstance != null
  const showSellButton = sellable && (!isItemShopsItem || shopVisitOpen)
  const sellButtonLabel = (() => {
    if (isItemShopsItem && shopVisitOpen && definition && shopInstance) {
      if (item.sellbackValue != null) {
        return `Sell (${item.sellbackValue})`
      }
      const q = quoteItemShopsSellCoins(shopInstance, definition)
      return q != null ? (
        <Text>
          Sell for <Icon as={getIcon("Coins")} boxSize="0.8rem" />
          {q}
        </Text>
      ) : (
        "Sell"
      )
    }
    return "Sell"
  })()

  const [pending, setPending] = useState<PendingAction>(null)
  const subscriptionIdRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      const id = subscriptionIdRef.current
      if (id) unsubscribeById(id)
    }
  }, [])

  const dispatch = (
    action: "use" | "sell",
    extra?: {
      targetUserId?: string
      targetQueueItemId?: string
      targetInventoryItemId?: string
      password?: string
      coinAmount?: number
    },
  ) => {
    const subscriptionId = `inventory-${action}-${item.itemId}-${Date.now()}`
    subscriptionIdRef.current = subscriptionId
    setPending({ itemId: item.itemId, action })

    subscribeById(subscriptionId, {
      send: (event: {
        type: string
        data?: { success: boolean; title?: string; message?: string }
      }) => {
        if (event.type !== "INVENTORY_ACTION_RESULT" || !event.data) return
        unsubscribeById(subscriptionId)
        if (subscriptionIdRef.current === subscriptionId) {
          subscriptionIdRef.current = null
        }
        setPending(null)
        const blocked =
          !event.data.success &&
          typeof event.data.message === "string" &&
          event.data.message.toLowerCase().includes("blocked")
        toaster.create({
          title:
            event.data.title ?? (event.data.success ? "Success" : blocked ? "Blocked" : "Error"),
          description:
            event.data.message || (event.data.success ? "Action completed" : "Action failed"),
          type: event.data.success ? "success" : blocked ? "warning" : "error",
        })
      },
    })

    if (action === "use") {
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
    } else {
      emitToSocket("SELL_INVENTORY_ITEM", { itemId: item.itemId })
    }

    setTimeout(() => {
      if (subscriptionIdRef.current === subscriptionId) {
        unsubscribeById(subscriptionId)
        subscriptionIdRef.current = null
        setPending(null)
        toaster.create({
          title: "Timeout",
          description: "Action timed out",
          type: "error",
        })
      }
    }, 10000)
  }

  return (
    <HStack {...inventorySlotFrameProps}>
      <VStack align="center" justify="center" h="100%" minW="4rem">
        <ItemArtwork
          imageUrl={definition?.imageUrl}
          imageUrlLarge={definition?.imageUrlLarge}
          icon={definition?.icon}
          rarity={definition?.rarity}
          artworkFrame={definition?.artworkFrame}
          boxSize={definition?.slotPool === "collection" ? FRAMED_ARTWORK_BOX_SIZE : 7}
          alt={name}
        />
        {definition != null && (
          <ItemRarityTag size={["xs", "sm"]} rarity={resolveItemRarity(definition)} />
        )}
      </VStack>
      <VStack align="start" gap={0} flex="1" minW={0}>
        <HStack gap={2} flexWrap="wrap">
          <Text fontWeight="medium">{name}</Text>
          {item.quantity > 1 && (
            <Badge size="sm" variant="subtle">
              ×{item.quantity}
            </Badge>
          )}
        </HStack>
        {description && (
          <Text fontSize="xs" color="fg.muted">
            {description}
          </Text>
        )}
      </VStack>
      <Stack direction="column" gap={2} flexShrink={0}>
        {mediaKey && (
          <Button
            size="xs"
            variant="solid"
            colorPalette="action"
            onClick={() => modalSend({ type: "EDIT_QUEUE", browseMediaKey: mediaKey })}
          >
            <Icon as={getIcon("ListMusic")} boxSize="0.9rem" />
            Queue a track
          </Button>
        )}
        {consumable && (
          <InventoryUseButton
            itemId={item.itemId}
            requiresTarget={definition?.requiresTarget}
            allItems={allItems}
            definitionMap={definitionMap}
            coinBalance={coinBalance}
            useLoading={pending?.itemId === item.itemId && pending.action === "use"}
            onUse={(extra) => dispatch("use", extra)}
          />
        )}
        {showSellButton && (
          <Button
            size="xs"
            variant="outline"
            loading={pending?.itemId === item.itemId && pending.action === "sell"}
            onClick={() => dispatch("sell")}
          >
            {/* <Icon as={getIcon("Coins")} boxSize="0.8rem" /> */}
            {sellButtonLabel}
          </Button>
        )}
      </Stack>
    </HStack>
  )
}

function InventoryTab({
  items,
  maxSlots,
  maxCollectionSlots,
  definitionMap,
  coinBalance,
}: InventoryTabProps) {
  const myMedia = useMyMedia()
  const isAdmin = useIsAdmin()
  const canAddToQueue = useCanAddToQueue()
  // Browsing a record only helps if the viewer is allowed to queue from it.
  const mediaKeys = new Set(isAdmin || canAddToQueue ? myMedia.map((shelf) => shelf.mediaKey) : [])
  const inventoryItems = items.filter(
    (item) => (definitionMap.get(item.definitionId)?.slotPool ?? "inventory") !== "collection",
  )
  const collectionItems = items.filter(
    (item) => definitionMap.get(item.definitionId)?.slotPool === "collection",
  )
  const emptyInventory = maxSlots > 0 ? Math.max(0, maxSlots - inventoryItems.length) : 0
  const showInventoryGrid = maxSlots > 0
  // The collection only exists once something is in it, and unlike the inventory
  // bag it never advertises empty shelf space.
  const showCollection = collectionItems.length > 0
  const mediaKeyForItem = (item: InventoryItem): string | undefined => {
    const shortId = definitionMap.get(item.definitionId)?.shortId
    return shortId && mediaKeys.has(shortId) ? shortId : undefined
  }

  return (
    <Box>
      <HStack justify="space-between" align="baseline" mb={2}>
        <Heading size="sm">Inventory</Heading>
        {showInventoryGrid && (
          <Text fontSize="xs" color="fg.muted">
            {inventoryItems.length} / {maxSlots} slots
          </Text>
        )}
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
                mediaKey={mediaKeyForItem(item)}
              />
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  )
}

export default InventoryTab
