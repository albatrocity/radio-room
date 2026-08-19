import { useState } from "react"
import { Box, Button, Center, Heading, HStack, Stack, Table, Text, VStack } from "@chakra-ui/react"
import type { ItemShopsUserGameState, ShopOffer, ShoppingSessionInstance } from "@repo/types"
import type { CurrentShopOffersComponentProps } from "../../../types/PluginComponent"
import { useUserGameState } from "../../Modals/UserGameStateContext"
import { usePluginComponentContext } from "../context"
import { getIcon } from "../icons"
import { SvgIcon } from "../../ui/svg-icon"
import ItemArtwork from "../../ItemArtwork"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../artworkFrames/frameStyles"
import {
  MediaItemPreviewDialog,
  shopOfferPreviewTarget,
} from "../../MediaItemPreviewDialog"
import { ButtonTemplateComponent } from "./ButtonComponent"
import { ItemRarityTag } from "../ItemRarityTag"
import { LinkifiedText } from "../../LinkifiedText"

type Props = CurrentShopOffersComponentProps

/** Human-readable percentage (rate is a multiplier on base coin value). */
function formatBuybackPercent(rate: number): string {
  const pct = rate * 100
  if (Number.isInteger(pct)) return `${pct}%`
  return `${Math.round(pct * 10) / 10}%`
}

const COINS_ICON = getIcon("Coins")

/**
 * Renders the current user's shop instance from `pluginUserState` (ADR 0097).
 * (Props are intentionally empty — data comes from `UserGameStateContext`.)
 */
export function CurrentShopOffersTemplateComponent(_props: Props) {
  const { pluginName } = usePluginComponentContext()!
  const gameState = useUserGameState()
  const bag = gameState?.getPluginState<ItemShopsUserGameState>(pluginName) ?? null
  const instance: ShoppingSessionInstance | null = bag?.currentShopInstance ?? null
  const [previewOffer, setPreviewOffer] = useState<ShopOffer | null>(null)

  if (!instance) {
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
  const hasFramedOffer = instance.offers.some((row) => row.artworkFrame != null)

  return (
    <Box overflowX="auto" w="full">
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
      <Table.Root
        size="sm"
        variant="outline"
        bg="primary.subtle/30"
        borderColor="primary.muted"
        colorPalette="primary"
        layerStyle="themeTransition"
      >
        <Table.Header
          bg="primary.emphasized/40"
          borderBottomWidth="1px"
          borderBottomColor="primary.muted"
        >
          <Table.Row>
            <Table.ColumnHeader w={hasFramedOffer ? "4rem" : "52px"} aria-label="Icon" />
            <Table.ColumnHeader>Item</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end" w="min-content">
              Price
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {instance.offers.map((row, index) => {
            const cannotAfford = gameState == null || gameState.getAttribute("coin") < row.price
            const outOfStock = !row.available
            const offerId = row.offerId ?? index
            const action = `buy:${offerId}`

            return (
              <Table.Row key={offerId} opacity={outOfStock ? 0.55 : 1}>
                <Table.Cell verticalAlign="middle" w={hasFramedOffer ? "4rem" : "52px"}>
                  <VStack align="center">
                    <Center>
                      <ItemArtwork
                        imageUrl={row.imageUrl}
                        imageUrlLarge={row.imageUrlLarge}
                        icon={row.icon}
                        rarity={row.rarity}
                        artworkFrame={row.artworkFrame}
                        boxSize={row.artworkFrame ? FRAMED_ARTWORK_BOX_SIZE : 5}
                        alt={row.name}
                      />
                    </Center>
                    {row.rarity && <ItemRarityTag size={["xs", "sm"]} rarity={row.rarity} />}
                  </VStack>
                </Table.Cell>
                <Table.Cell verticalAlign="middle">
                  <VStack align="start" gap={0}>
                    <Text fontWeight="bold">{row.name}</Text>
                    <LinkifiedText fontSize="xs" color="fg.muted" lineHeight="short">
                      {row.description}
                    </LinkifiedText>
                  </VStack>
                </Table.Cell>

                <Table.Cell verticalAlign="middle" textAlign="end">
                  <Stack
                    direction={["column", "row"]}
                    align="center"
                    justify="end"
                    gap={2}
                    flexShrink={0}
                  >
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
                    {row.artworkFrame && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewOffer(row)}
                      >
                        Preview
                      </Button>
                    )}
                  </Stack>
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>
      <MediaItemPreviewDialog
        open={previewOffer != null}
        onOpenChange={(next) => {
          if (!next) setPreviewOffer(null)
        }}
        item={previewOffer ? shopOfferPreviewTarget(previewOffer) : null}
      />
    </Box>
  )
}
