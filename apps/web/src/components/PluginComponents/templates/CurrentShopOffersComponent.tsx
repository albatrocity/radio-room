import { Box, Heading, HStack, Stack, Text, VStack } from "@chakra-ui/react"
import type {
  ItemDefinition,
  ItemShopsUserGameState,
  ShopOffer,
  ShoppingSessionInstance,
} from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME, ITEM_SHOPS_TAB_ID } from "@repo/types"
import type { CurrentShopOffersComponentProps } from "../../../types/PluginComponent"
import { useUserGameState } from "../../Modals/UserGameStateContext"
import ItemDetailListItem from "../../Modals/GameState/ItemDetailListItem"
import { buildItemDetailFrame } from "../../Modals/GameState/itemDetailFrame"
import { useOpenItemDetail } from "../../Modals/GameState/useOpenItemDetail"
import { usePluginComponentContext } from "../context"
import { getIcon } from "../icons"
import { SvgIcon } from "../../ui/svg-icon"
import ItemArtwork from "../../ItemArtwork"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../artworkFrames/frameStyles"
import { ButtonTemplateComponent } from "./ButtonComponent"
import { ItemRarityTag } from "../ItemRarityTag"
import { MediaConditionTag } from "../MediaConditionTag"
import { resolveDisplayArtworkFrame } from "../../../lib/resolveDisplayArtworkFrame"

type Props = CurrentShopOffersComponentProps

const SHOP_TAB_ID = `${ITEM_SHOPS_PLUGIN_NAME}:${ITEM_SHOPS_TAB_ID}`

/** Human-readable percentage (rate is a multiplier on base coin value). */
function formatBuybackPercent(rate: number): string {
  const pct = rate * 100
  if (Number.isInteger(pct)) return `${pct}%`
  return `${Math.round(pct * 10) / 10}%`
}

const COINS_ICON = getIcon("Coins")

function definitionForOffer(
  offer: ShopOffer,
  definitions: ItemDefinition[],
): ItemDefinition | undefined {
  return definitions.find((d) => d.shortId === offer.shortId)
}

/**
 * Renders the current user's shop instance from `pluginUserState` (ADR 0097).
 * (Props are intentionally empty — data comes from `UserGameStateContext`.)
 */
export function CurrentShopOffersTemplateComponent(_props: Props) {
  const { pluginName } = usePluginComponentContext()!
  const gameState = useUserGameState()
  const openDetail = useOpenItemDetail(SHOP_TAB_ID)
  const bag =
    pluginName != null
      ? gameState?.getPluginState<ItemShopsUserGameState>(pluginName) ?? null
      : null
  const instance: ShoppingSessionInstance | null = bag?.currentShopInstance ?? null
  const definitions = gameState?.itemDefinitions ?? []

  if (!pluginName || !instance) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No shop is open for you right now. Wait for the next shopping session, or ask a host to
        start one.
      </Text>
    )
  }

  const listedRate = instance.listedBuybackRate
  const unlistedRate = instance.unlistedBuybackRate
  const showBuybackMeta = listedRate != null && unlistedRate != null

  return (
    <Box w="full">
      {instance.openingMessage ? (
        <Text fontSize="sm" color="fg.muted" mb={3}>
          {instance.openingMessage}
        </Text>
      ) : null}
      <Heading as="h3" size="sm" mb={2}>
        {instance.shopName}
      </Heading>
      {showBuybackMeta ? (
        <Text fontSize="xs" color="fg.muted" mb={3} lineHeight="short">
          Buyback: items this shop sells — {formatBuybackPercent(listedRate)} of the price below.
          Other tradeable items — {formatBuybackPercent(unlistedRate)} of catalog value.
        </Text>
      ) : null}
      <Stack gap={2}>
        {instance.offers.map((row, index) => {
          const cannotAfford = gameState == null || gameState.getAttribute("coin") < row.price
          const outOfStock = !row.available
          const offerId = row.offerId ?? index
          const action = `buy:${offerId}`
          const definition = definitionForOffer(row, definitions)
          const detailView = definition?.detailView
          const openOfferDetail = detailView
            ? () =>
                openDetail(
                  buildItemDetailFrame({
                    shortId: row.shortId,
                    title: row.name,
                    source: "shop",
                    detailView,
                    definitionId: definition?.id,
                    shopOfferId: offerId,
                  }),
                )
            : undefined

          return (
            <ItemDetailListItem
              key={offerId}
              opacity={outOfStock ? 0.55 : undefined}
              artwork={
                <VStack align="center" gap={1} w="5rem" minW="5rem" maxW="5rem">
                  <ItemArtwork
                    imageUrl={row.imageUrl}
                    imageUrlLarge={row.imageUrlLarge}
                    icon={row.icon}
                    rarity={row.rarity}
                    artworkFrame={resolveDisplayArtworkFrame({
                      mediaFormat: row.mediaFormat,
                      condition: row.condition,
                      artworkFrame: row.artworkFrame,
                    })}
                    boxSize={row.artworkFrame ? FRAMED_ARTWORK_BOX_SIZE : 5}
                    alt={row.name}
                    interactive={!openOfferDetail}
                  />
                  {row.rarity && <ItemRarityTag size={["xs", "sm"]} rarity={row.rarity} />}
                </VStack>
              }
              name={row.name}
              titleAddon={
                row.condition ? <MediaConditionTag size="sm" condition={row.condition} /> : undefined
              }
              subtitle={row.artist?.trim() || undefined}
              description={row.description}
              onOpen={openOfferDetail}
              openLabel={detailView?.actionLabel}
              trailing={
                <Stack direction={["column", "row"]} align="center" justify="end" gap={2}>
                  <HStack gap={1}>
                    {COINS_ICON && (
                      <SvgIcon boxSize="0.8rem" color="secondaryText" icon={COINS_ICON} />
                    )}
                    <Text fontWeight="medium">{row.price}</Text>
                  </HStack>
                  <ButtonTemplateComponent
                    label="Buy"
                    action={action}
                    pluginName={pluginName}
                    variant="solid"
                    size="sm"
                    confirmMessage={`Spend ${row.price} coins on ${row.name}?`}
                    confirmText="Buy"
                    disabled={cannotAfford || outOfStock}
                  />
                </Stack>
              }
            />
          )
        })}
      </Stack>
    </Box>
  )
}
