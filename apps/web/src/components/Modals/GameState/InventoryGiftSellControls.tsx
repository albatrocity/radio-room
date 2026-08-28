import { useEffect, useRef, useState } from "react"
import { Box, Button, HStack, Icon, Menu, Portal, Text } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition, ItemShopsUserGameState } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { quoteItemShopsSellCoins } from "../../../lib/itemShopsSellQuote"
import { getIcon } from "../../PluginComponents/icons"
import { toaster } from "../../ui/toaster"
import { useUserGameState } from "../UserGameStateContext"
import { emitGiftOffer } from "./giftSocketActions"
import { InventoryTargetUserPopover } from "./TargetUserPicker"

type Props = {
  item: InventoryItem
  definition?: ItemDefinition
  size?: "xs" | "sm"
  /**
   * `menu` (default) combines Gift/Sell for tight list rows.
   * `split` shows separate "Gift to…" and "Sell for" buttons (collection detail).
   */
  layout?: "menu" | "split"
}

/**
 * Gift / sell actions for a held inventory item (list rows and collection detail).
 */
export default function InventoryGiftSellControls({
  item,
  definition,
  size = "sm",
  layout = "menu",
}: Props) {
  const gameState = useUserGameState()
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
  const showTradeGiftMenu = allowTrading && (showSellButton || showGiftButton)

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

  const [pending, setPending] = useState<"sell" | "gift" | null>(null)
  const [giftPickerOpen, setGiftPickerOpen] = useState(false)
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false)
  const secondaryActionRef = useRef<HTMLButtonElement>(null)
  const subscriptionIdRef = useRef<string | null>(null)
  const secondaryActionOpen = tradeMenuOpen || giftPickerOpen

  useEffect(() => {
    return () => {
      const id = subscriptionIdRef.current
      if (id) unsubscribeById(id)
    }
  }, [])

  if (!showGiftButton && !showSellButton) return null

  const offerGiftTo = (toUserId: string) => {
    setPending("gift")
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

  const dispatchSell = () => {
    const subscriptionId = `inventory-sell-${item.itemId}-${Date.now()}`
    subscriptionIdRef.current = subscriptionId
    setPending("sell")

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
        toaster.create({
          title: event.data.title ?? (event.data.success ? "Success" : "Error"),
          description:
            event.data.message || (event.data.success ? "Action completed" : "Action failed"),
          type: event.data.success ? "success" : "error",
        })
      },
    })

    emitToSocket("SELL_INVENTORY_ITEM", { itemId: item.itemId })

    window.setTimeout(() => {
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

  const giftButton = (
    <Button
      ref={secondaryActionRef}
      size={layout === "split" ? "sm" : size}
      width="full"
      variant="outline"
      px={2}
      loading={pending === "gift"}
    >
      Gift to…
    </Button>
  )

  if (layout === "split") {
    return (
      <HStack
        w="full"
        gap={2}
        align="stretch"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {showGiftButton && (
          <Box flex="1" minW={0} position="relative">
            <InventoryTargetUserPopover
              includeSelf={false}
              placeholder="Gift to…"
              fullWidth
              size="sm"
              onPick={offerGiftTo}
            >
              {giftButton}
            </InventoryTargetUserPopover>
          </Box>
        )}
        {showSellButton && (
          <Button
            flex="1"
            size={size}
            variant="outline"
            loading={pending === "sell"}
            onClick={dispatchSell}
          >
            {sellButtonLabel}
          </Button>
        )}
      </HStack>
    )
  }

  return (
    <Box
      position="relative"
      w="full"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {showTradeGiftMenu ? (
        <Menu.Root open={tradeMenuOpen} onOpenChange={(e) => setTradeMenuOpen(e.open)}>
          <Menu.Trigger asChild>
            <Button
              ref={secondaryActionRef}
              size={size}
              width="full"
              variant="outline"
              px={2}
              whiteSpace="nowrap"
              aria-label="Gift or sell"
              aria-expanded={secondaryActionOpen}
              data-state={secondaryActionOpen ? "open" : undefined}
              bg={secondaryActionOpen ? "colorPalette.subtle" : undefined}
              loading={pending === "sell" || pending === "gift"}
            >
              Gift/sell…
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
                      dispatchSell()
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
        <Button
          size={size}
          width="full"
          variant="outline"
          loading={pending === "sell"}
          onClick={dispatchSell}
        >
          {sellButtonLabel}
        </Button>
      )}
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
  )
}
