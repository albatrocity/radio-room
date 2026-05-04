import { Box, Center, Heading, HStack, Table, Text, VStack } from "@chakra-ui/react"
import type { CurrentShopOffersComponentProps } from "../../../types/PluginComponent"
import { useUserGameState } from "../../Modals/UserGameStateContext"
import { usePluginComponentContext } from "../context"
import { getIcon } from "../icons"
import { SvgIcon } from "../../ui/svg-icon"
import { ButtonTemplateComponent } from "./ButtonComponent"

type Props = CurrentShopOffersComponentProps

/** Human-readable percentage (rate is a multiplier on base coin value). */
function formatBuybackPercent(rate: number): string {
  const pct = rate * 100
  if (Number.isInteger(pct)) return `${pct}%`
  return `${Math.round(pct * 10) / 10}%`
}

const COINS_ICON = getIcon("coins")

/**
 * Renders the current user's `currentShopInstance` from room game state.
 * (Props are intentionally empty — data comes from `UserGameStateContext`.)
 */
export function CurrentShopOffersTemplateComponent(_props: Props) {
  const { pluginName } = usePluginComponentContext()!
  const gameState = useUserGameState()
  const instance = gameState?.currentShopInstance ?? null

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
            <Table.ColumnHeader w="52px" aria-label="Icon" />
            <Table.ColumnHeader>Item</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Price</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end" w="min-content" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {instance.offers.map((row) => {
            const IconComponent = getIcon(row.icon)
            const cannotAfford = gameState == null || gameState.getAttribute("coin") < row.price
            const outOfStock = !row.available
            const action = `buy:${row.shortId}`

            return (
              <Table.Row key={row.shortId} opacity={outOfStock ? 0.55 : 1}>
                <Table.Cell verticalAlign="middle" w="52px">
                  <Center width="full" height="full">
                    {IconComponent ? (
                      <SvgIcon icon={IconComponent} boxSize={5} color="fg.muted" aria-hidden />
                    ) : null}
                  </Center>
                </Table.Cell>
                <Table.Cell verticalAlign="middle">
                  <VStack align="start" gap={0}>
                    <Text fontWeight="bold">{row.name}</Text>
                    <Text fontSize="xs" color="fg.muted" lineHeight="short">
                      {row.description}
                    </Text>
                  </VStack>
                </Table.Cell>
                <Table.Cell verticalAlign="middle" textAlign="end">
                  <HStack gap={0.5}>
                    <Text fontWeight="medium">{row.price}</Text>
                    {COINS_ICON && <SvgIcon color="secondaryText/50" icon={COINS_ICON} />}
                  </HStack>
                </Table.Cell>

                <Table.Cell verticalAlign="middle" textAlign="end">
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
                </Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  )
}
