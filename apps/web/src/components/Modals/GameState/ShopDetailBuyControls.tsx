import { useEffect, useRef, useState } from "react"
import { Box, Button, Icon, Popover, Text } from "@chakra-ui/react"
import type { ItemShopsUserGameState } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { getIcon } from "../../PluginComponents/icons"
import { toaster } from "../../ui/toaster"
import { useUserGameState } from "../UserGameStateContext"
import type { GameStateItemDetailFrame } from "../../../types/GameStateDetail"

type Props = {
  frame: GameStateItemDetailFrame
  padded?: boolean
}

/**
 * Shop-offer Buy for item detail (same `buy:{offerId}` action as the shop list).
 * Detail is rendered outside plugin tab context, so this does not use
 * `ButtonTemplateComponent`.
 */
export default function ShopDetailBuyControls({ frame, padded = false }: Props) {
  const gameState = useUserGameState()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const subscriptionIdRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      const id = subscriptionIdRef.current
      if (id) unsubscribeById(id)
    }
  }, [])

  if (frame.source !== "shop" || frame.shopOfferId == null) return null

  const instance =
    gameState?.getPluginState<ItemShopsUserGameState>(ITEM_SHOPS_PLUGIN_NAME)?.currentShopInstance ??
    null
  const offer = instance?.offers.find(
    (row, index) => (row.offerId ?? index) === frame.shopOfferId,
  )
  if (!offer) return null

  const cannotAfford = gameState == null || gameState.getAttribute("coin") < offer.price
  const outOfStock = !offer.available
  const action = `buy:${frame.shopOfferId}`

  const dispatchBuy = () => {
    setIsLoading(true)
    const subscriptionId = `shop-detail-buy-${action}-${Date.now()}`
    subscriptionIdRef.current = subscriptionId

    subscribeById(subscriptionId, {
      eventTypes: ["PLUGIN_ACTION_RESULT"],
      send: (event: { type: string; data?: { success: boolean; message?: string } }) => {
        if (event.type !== "PLUGIN_ACTION_RESULT" || !event.data) return
        setIsLoading(false)
        unsubscribeById(subscriptionId)
        if (subscriptionIdRef.current === subscriptionId) {
          subscriptionIdRef.current = null
        }
        toaster.create({
          title: event.data.success ? "Success" : "Error",
          description:
            event.data.message || (event.data.success ? "Action completed" : "Action failed"),
          type: event.data.success ? "success" : "error",
        })
      },
    })

    emitToSocket("EXECUTE_PLUGIN_ACTION", { pluginName: ITEM_SHOPS_PLUGIN_NAME, action })

    window.setTimeout(() => {
      if (subscriptionIdRef.current === subscriptionId) {
        setIsLoading(false)
        unsubscribeById(subscriptionId)
        subscriptionIdRef.current = null
        toaster.create({
          title: "Timeout",
          description: "Action timed out",
          type: "error",
        })
      }
    }, 10000)
  }

  const buyButton = (
    <Button
      size="sm"
      width="full"
      variant="solid"
      loading={isLoading}
      disabled={cannotAfford || outOfStock}
      onClick={() => setConfirmOpen(true)}
    >
      Buy for <Icon as={getIcon("Coins")} boxSize="0.8rem" />
      {offer.price}
    </Button>
  )

  const controls = (
    <Box
      w="full"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Popover.Root open={confirmOpen} onOpenChange={(e) => setConfirmOpen(e.open)}>
        <Popover.Trigger asChild>{buyButton}</Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content css={{ "--popover-bg": "{colors.appBg}" }} color="fg">
            <Popover.Arrow />
            <Popover.Body>
              <Text fontSize="sm">
                Spend {offer.price} coins on {offer.name}?
              </Text>
            </Popover.Body>
            <Popover.Footer justifyContent="flex-end" display="flex">
              <Button variant="plain" size="sm" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                colorPalette="primary"
                onClick={() => {
                  setConfirmOpen(false)
                  dispatchBuy()
                }}
                loading={isLoading}
              >
                Buy
              </Button>
            </Popover.Footer>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    </Box>
  )

  if (!padded) return controls
  return (
    <Box px={3} py={3}>
      {controls}
    </Box>
  )
}
