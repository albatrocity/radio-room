import { Box, Center, Table, Text, VStack } from "@chakra-ui/react"
import type {
  ShopOfferTableComponentProps,
  ShopOfferTableRow,
} from "../../../types/PluginComponent"
import { useUserGameState } from "../../Modals/UserGameStateContext"
import { usePluginComponentContext } from "../context"
import { getIcon } from "../icons"
import { SvgIcon } from "../../ui/svg-icon"
import { AnimatedShopQty } from "./AnimatedShopQty"
import { ButtonTemplateComponent } from "./ButtonComponent"

function ShopOfferTableRowView({
  row,
  pluginName,
}: {
  row: ShopOfferTableRow
  pluginName?: string
}) {
  const { store } = usePluginComponentContext()!
  const gameState = useUserGameState()
  const qtyRaw = store[row.quantityStoreKey]
  const qty = typeof qtyRaw === "number" ? qtyRaw : Number(qtyRaw ?? 0)
  const qtyFinite = Number.isFinite(qty)
  const outOfStock = qtyFinite && qty <= 0
  const IconComponent = getIcon(row.icon)

  const attr = row.balanceAttribute ?? "coin"
  const cannotAfford = gameState == null || gameState.getAttribute(attr) < row.price

  return (
    <Table.Row opacity={outOfStock ? 0.6 : 1}>
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
        <Text fontWeight="medium">{row.price}</Text>
      </Table.Cell>
      <Table.Cell verticalAlign="middle" textAlign="center">
        {Number.isFinite(qty) ? <AnimatedShopQty qty={qty} /> : <Text>—</Text>}
      </Table.Cell>
      <Table.Cell verticalAlign="middle" textAlign="end">
        <ButtonTemplateComponent
          label={row.buyLabel ?? "Buy"}
          action={row.action}
          pluginName={pluginName}
          variant="solid"
          size="sm"
          confirmMessage={row.confirmMessage}
          confirmText={row.confirmText}
          disabled={cannotAfford || outOfStock}
        />
      </Table.Cell>
    </Table.Row>
  )
}

/**
 * Tabular shop UI: icon | name + description | price | qty | buy.
 */
export function ShopOfferTableTemplateComponent({ rows }: ShopOfferTableComponentProps) {
  const { pluginName } = usePluginComponentContext()!

  return (
    <Box overflowX="auto" w="full">
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
            <Table.ColumnHeader textAlign="center">Qty</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end" w="min-content">
              {/* Buy */}
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row, index) => (
            <ShopOfferTableRowView
              key={`${row.action}-${index}`}
              row={row}
              pluginName={pluginName}
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  )
}
