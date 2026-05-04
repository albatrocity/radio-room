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
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { quoteItemShopsSellCoins } from "../../../lib/itemShopsSellQuote"
import { getIcon } from "../../PluginComponents/icons"
import { toaster } from "../../ui/toaster"
import { useUserGameState } from "../UserGameStateContext"
import { InventoryUseTargetPopover } from "./TargetUserPicker"

interface InventoryTabProps {
  items: InventoryItem[]
  maxSlots: number
  definitionMap: Map<string, ItemDefinition>
}

interface InventoryRowProps {
  item: InventoryItem
  definition?: ItemDefinition
}

/**
 * Shared frame for each slot (item or empty placeholder).
 * Uses `primary.*` semantic tokens so background and border follow the active app theme
 * (see `chakraTheme.ts` + `[data-theme]` on the document).
 */
const inventorySlotFrameProps = {
  align: "flex-start" as const,
  gap: 2,
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

function InventoryRow({ item, definition }: InventoryRowProps) {
  const gameState = useUserGameState()
  const name = definition?.name ?? item.definitionId
  const description = definition?.description
  const icon = definition?.icon
  const consumable = definition?.consumable ?? false
  const tradeable = definition?.tradeable ?? false
  const coinValue = definition?.coinValue ?? 0
  const sellable = tradeable && coinValue > 0
  const requiresTargetUser = definition?.requiresTarget === "user"
  const isItemShopsItem = item.sourcePlugin === ITEM_SHOPS_PLUGIN_NAME
  const shopVisitOpen = gameState?.currentShopInstance != null
  const showSellButton = sellable && (!isItemShopsItem || shopVisitOpen)
  const sellButtonLabel =
    isItemShopsItem && shopVisitOpen && definition && gameState?.currentShopInstance
      ? (() => {
          const q = quoteItemShopsSellCoins(gameState.currentShopInstance, definition)
          return q != null ? `Sell (${q})` : "Sell"
        })()
      : "Sell"
  const IconGlyph = icon ? getIcon(icon) : undefined

  const [pending, setPending] = useState<PendingAction>(null)
  const subscriptionIdRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      const id = subscriptionIdRef.current
      if (id) unsubscribeById(id)
    }
  }, [])

  const dispatch = (action: "use" | "sell", targetUserId?: string) => {
    const subscriptionId = `inventory-${action}-${item.itemId}-${Date.now()}`
    subscriptionIdRef.current = subscriptionId
    setPending({ itemId: item.itemId, action })

    subscribeById(subscriptionId, {
      send: (event: { type: string; data?: { success: boolean; message?: string } }) => {
        if (event.type !== "INVENTORY_ACTION_RESULT" || !event.data) return
        unsubscribeById(subscriptionId)
        if (subscriptionIdRef.current === subscriptionId) {
          subscriptionIdRef.current = null
        }
        setPending(null)
        toaster.create({
          title: event.data.success ? "Success" : "Error",
          description:
            event.data.message || (event.data.success ? "Action completed" : "Action failed"),
          type: event.data.success ? "success" : "error",
        })
      },
    })

    if (action === "use") {
      emitToSocket(
        "USE_INVENTORY_ITEM",
        targetUserId ? { itemId: item.itemId, targetUserId } : { itemId: item.itemId },
      )
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
      {IconGlyph ? (
        <Icon as={IconGlyph} boxSize={7} color="fg.muted" flexShrink={0} aria-hidden />
      ) : (
        <Box boxSize={7} flexShrink={0} aria-hidden />
      )}
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
      <HStack gap={2} flexShrink={0}>
        {consumable &&
          (requiresTargetUser ? (
            <InventoryUseTargetPopover onPick={(targetUserId) => dispatch("use", targetUserId)}>
              <Button
                size="xs"
                variant="solid"
                colorPalette="action"
                loading={pending?.itemId === item.itemId && pending.action === "use"}
              >
                Use
              </Button>
            </InventoryUseTargetPopover>
          ) : (
            <Button
              size="xs"
              variant="solid"
              colorPalette="action"
              loading={pending?.itemId === item.itemId && pending.action === "use"}
              onClick={() => dispatch("use")}
            >
              Use
            </Button>
          ))}
        {showSellButton && (
          <Button
            size="xs"
            variant="outline"
            loading={pending?.itemId === item.itemId && pending.action === "sell"}
            onClick={() => dispatch("sell")}
          >
            {sellButtonLabel}
          </Button>
        )}
      </HStack>
    </HStack>
  )
}

function InventoryTab({ items, maxSlots, definitionMap }: InventoryTabProps) {
  const emptySlotCount = maxSlots > 0 ? Math.max(0, maxSlots - items.length) : 0
  const showSlotGrid = maxSlots > 0

  return (
    <Box>
      <HStack justify="space-between" align="baseline" mb={2}>
        <Heading size="sm">Inventory</Heading>
        {showSlotGrid && (
          <Text fontSize="xs" color="fg.muted">
            {items.length} / {maxSlots} slots
          </Text>
        )}
      </HStack>

      {!showSlotGrid && items.length === 0 && (
        <Text fontSize="sm" color="fg.muted">
          Your inventory is empty.
        </Text>
      )}

      {(items.length > 0 || showSlotGrid) && (
        <Stack gap={2}>
          {items.map((item) => (
            <InventoryRow
              key={item.itemId}
              item={item}
              definition={definitionMap.get(item.definitionId)}
            />
          ))}
          {showSlotGrid &&
            Array.from({ length: emptySlotCount }).map((_, i) => (
              <EmptyInventorySlot key={`empty-${i}`} />
            ))}
        </Stack>
      )}
    </Box>
  )
}

export default InventoryTab
