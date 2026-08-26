import { useEffect, useRef, useState } from "react"
import {
  Badge,
  Box,
  Button,
  Center,
  HStack,
  Heading,
  Icon,
  Menu,
  Portal,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition, ItemShopsUserGameState } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { resolveItemRarity } from "@repo/game-logic"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { quoteItemShopsSellCoins } from "../../../lib/itemShopsSellQuote"
import ItemArtwork from "../../ItemArtwork"
import { LinkifiedText } from "../../LinkifiedText"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../artworkFrames/frameStyles"
import { getIcon } from "../../PluginComponents/icons"
import { toaster } from "../../ui/toaster"
import { useUserGameState } from "../UserGameStateContext"
import { InventoryUseButton } from "./InventoryUseButton"
import { ItemRarityTag } from "../../PluginComponents/ItemRarityTag"
import { ItemDetailActionButton } from "./ItemDetailActionButton"
import { itemDetailClickableProps } from "./itemDetailClickableProps"
import { buildItemDetailFrame } from "./itemDetailFrame"
import { useOpenItemDetail } from "./useOpenItemDetail"
import { InventoryTargetUserPopover } from "./TargetUserPicker"

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
type PendingAction = { itemId: string; action: "use" | "sell" | "gift" } | null

import { emitGiftOffer } from "./giftSocketActions"
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
}: InventoryRowProps) {
  const gameState = useUserGameState()
  const openDetail = useOpenItemDetail("inventory")
  const name = definition?.name ?? item.definitionId
  const description = definition?.description
  const consumable = definition?.consumable ?? false
  const tradeable = definition?.tradeable ?? false
  const coinValue = definition?.coinValue ?? 0
  const sellable = tradeable && coinValue > 0
  const allowTrading = gameState?.session?.config.allowTrading === true
  const showGiftButton = tradeable && allowTrading
  const isItemShopsItem = item.sourcePlugin === ITEM_SHOPS_PLUGIN_NAME
  const shopInstance =
    gameState?.getPluginState<ItemShopsUserGameState>(ITEM_SHOPS_PLUGIN_NAME)
      ?.currentShopInstance ?? null
  const shopVisitOpen = shopInstance != null
  const showSellButton = sellable && (!isItemShopsItem || shopVisitOpen)
  const detailView = definition?.detailView
  const sellQuote =
    isItemShopsItem && shopVisitOpen && definition && shopInstance
      ? item.sellbackValue != null
        ? item.sellbackValue
        : quoteItemShopsSellCoins(shopInstance, definition)
      : null
  const sellButtonLabel =
    sellQuote != null ? (
      <Text>
        Sell for <Icon as={getIcon("Coins")} boxSize="0.8rem" />
        {sellQuote}
      </Text>
    ) : (
      "Sell"
    )
  const sellMenuLabel =
    sellQuote != null ? (
      <>
        Sell for <Icon as={getIcon("Coins")} boxSize="0.8rem" display="inline" /> {sellQuote}
      </>
    ) : (
      "Sell"
    )

  const [pending, setPending] = useState<PendingAction>(null)
  const [giftPickerOpen, setGiftPickerOpen] = useState(false)
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false)
  const secondaryActionRef = useRef<HTMLButtonElement>(null)
  const subscriptionIdRef = useRef<string | null>(null)

  const offerGiftTo = (toUserId: string) => {
    setPending({ itemId: item.itemId, action: "gift" })
    emitGiftOffer(item.itemId, toUserId, 1, (ok, message) => {
      setPending(null)
      toaster.create({
        title: ok ? "Gift offered" : "Gift failed",
        description: message,
        type: ok ? "success" : "error",
        duration: 4000,
      })
    })
  }

  const showTradeGiftMenu = allowTrading && (showSellButton || showGiftButton)
  const secondaryActionOpen = tradeMenuOpen || giftPickerOpen

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

  return (
    <HStack {...inventorySlotFrameProps}>
      <VStack align="center" justify="center" minW="4rem">
        <ItemArtwork
          imageUrl={definition?.imageUrl}
          imageUrlLarge={definition?.imageUrlLarge}
          icon={definition?.icon}
          rarity={definition?.rarity}
          artworkFrame={definition?.artworkFrame}
          boxSize={definition?.slotPool === "collection" ? FRAMED_ARTWORK_BOX_SIZE : 7}
          alt={name}
          onClick={detailView ? handleDetails : undefined}
        />
        {definition != null && (
          <ItemRarityTag size={["xs", "sm"]} rarity={resolveItemRarity(definition)} />
        )}
      </VStack>
      <VStack
        align="start"
        gap={0}
        flex="1"
        minW={0}
        {...itemDetailClickableProps({ detailView, name, onOpen: handleDetails })}
      >
        <HStack gap={2} flexWrap="wrap">
          <Text fontWeight="medium">{name}</Text>
          {item.quantity > 1 && (
            <Badge size="sm" variant="subtle">
              ×{item.quantity}
            </Badge>
          )}
        </HStack>
        {definition?.artist?.trim() ? (
          <Text fontSize="xs" color="fg.muted" lineClamp={1}>
            {definition.artist.trim()}
          </Text>
        ) : null}
        {description && (
          <LinkifiedText fontSize="xs" color="fg.muted">
            {description}
          </LinkifiedText>
        )}
      </VStack>
      <Stack direction="column" gap={2} flexShrink={0} align="stretch" minW="7.5rem">
        {detailView && <ItemDetailActionButton detailView={detailView} onClick={handleDetails} />}
        {(consumable || showTradeGiftMenu || showSellButton) && (
          <Box position="relative">
            <Stack gap={1} align="stretch">
              {consumable && (
                <InventoryUseButton
                  itemId={item.itemId}
                  requiresTarget={definition?.requiresTarget}
                  allItems={allItems}
                  definitionMap={definitionMap}
                  coinBalance={coinBalance}
                  useLoading={pending?.itemId === item.itemId && pending.action === "use"}
                  onUse={(extra) => dispatch("use", extra)}
                  fullWidth
                />
              )}
              {showTradeGiftMenu ? (
                <Menu.Root open={tradeMenuOpen} onOpenChange={(e) => setTradeMenuOpen(e.open)}>
                  <Menu.Trigger asChild>
                    <Button
                      ref={secondaryActionRef}
                      size="xs"
                      width="full"
                      variant="outline"
                      aria-label="Gift or sell"
                      aria-expanded={secondaryActionOpen}
                      data-state={secondaryActionOpen ? "open" : undefined}
                      bg={secondaryActionOpen ? "colorPalette.subtle" : undefined}
                      loading={
                        pending?.itemId === item.itemId &&
                        (pending.action === "sell" || pending.action === "gift")
                      }
                    >
                      Gift or sell…
                    </Button>
                  </Menu.Trigger>
                  <Portal>
                    <Menu.Positioner>
                      <Menu.Content minW="8rem">
                        {showSellButton && (
                          <Menu.Item
                            value="sell"
                            onClick={() => {
                              setTradeMenuOpen(false)
                              dispatch("sell")
                            }}
                          >
                            {sellMenuLabel}
                          </Menu.Item>
                        )}
                        {showGiftButton && (
                          <Menu.Item
                            value="gift"
                            onClick={() => {
                              setTradeMenuOpen(false)
                              // Wait for the menu dismiss layer to clear before opening.
                              window.setTimeout(() => setGiftPickerOpen(true), 0)
                            }}
                          >
                            Gift…
                          </Menu.Item>
                        )}
                      </Menu.Content>
                    </Menu.Positioner>
                  </Portal>
                </Menu.Root>
              ) : (
                showSellButton && (
                  <Button
                    size="xs"
                    width="full"
                    variant="outline"
                    loading={pending?.itemId === item.itemId && pending.action === "sell"}
                    onClick={() => dispatch("sell")}
                  >
                    {sellButtonLabel}
                  </Button>
                )
              )}
            </Stack>
            {showTradeGiftMenu && showGiftButton && (
              <InventoryTargetUserPopover
                includeSelf={false}
                placeholder="Gift to…"
                open={giftPickerOpen}
                onOpenChange={(e) => setGiftPickerOpen(e.open)}
                anchorRef={secondaryActionRef}
                onPick={(toUserId) => {
                  setGiftPickerOpen(false)
                  offerGiftTo(toUserId)
                }}
              >
                <button type="button" tabIndex={-1} aria-hidden />
              </InventoryTargetUserPopover>
            )}
          </Box>
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
  const gameState = useUserGameState()
  const allowTrading = gameState?.session?.config.allowTrading === true

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
