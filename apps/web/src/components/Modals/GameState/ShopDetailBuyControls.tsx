import { useState } from "react"
import { Box, Button, Icon, Popover, Text } from "@chakra-ui/react"
import type { ItemShopsUserGameState } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { emitPluginAction } from "../../../lib/emitPluginAction"
import { useSocketResultHandle } from "../../../lib/subscribeForSocketResult"
import { getIcon } from "../../PluginComponents/icons"
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
  const { track } = useSocketResultHandle()

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
    track(
      emitPluginAction(ITEM_SHOPS_PLUGIN_NAME, action, {
        onSettled: () => setIsLoading(false),
        onTimeout: () => setIsLoading(false),
      }),
    )
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
