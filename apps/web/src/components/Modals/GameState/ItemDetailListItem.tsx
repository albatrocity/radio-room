import type { ReactNode } from "react"
import { Box, HStack, Text, VStack } from "@chakra-ui/react"
import { LinkifiedText } from "../../LinkifiedText"
import { ItemDetailRowCaret } from "./ItemDetailRowCaret"
import { itemDetailClickableProps } from "./itemDetailClickableProps"

/**
 * Shared frame for Game State item cards (filled rows and empty inventory slots).
 */
export const itemDetailListItemFrameProps = {
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

type Props = {
  /** Leading image area (artwork + optional rarity). */
  artwork: ReactNode
  name: string
  /** Extra title-line content (e.g. quantity badge). */
  titleAddon?: ReactNode
  subtitle?: string
  description?: string
  /**
   * Opens item detail (ADR 0104 / 0127). Artwork+title is the click target;
   * a caret sits on the far right. Omit when the row does not navigate.
   */
  onOpen?: () => void
  openLabel?: string
  /** Actions left of the caret (Use, Buy, Gift/Sell). Not inside the detail hit target. */
  trailing?: ReactNode
  /**
   * Inventory bag on small viewports: artwork+copy on row 1, actions full-width
   * below. `md` and up keep actions at the end of the first row (ADR 0127).
   */
  actionsBelowOnMobile?: boolean
  opacity?: number
  /** Marks the row so catalog animations (wear headShake, restore swell) can target this card. */
  inventoryItemId?: string
}

/**
 * Artwork + title + description list row, optionally linking to item detail.
 */
export default function ItemDetailListItem({
  artwork,
  name,
  titleAddon,
  subtitle,
  description,
  onOpen,
  openLabel,
  trailing,
  actionsBelowOnMobile = false,
  opacity,
  inventoryItemId,
}: Props) {
  const clickable = itemDetailClickableProps({
    detailView: onOpen ? { actionLabel: openLabel } : undefined,
    name,
    onOpen,
  })

  const stackOnMobile = actionsBelowOnMobile && Boolean(trailing)
  const hasCaret = Boolean(onOpen)
  const hasTrailing = Boolean(trailing)
  const oneRowColumns =
    hasCaret && hasTrailing
      ? "minmax(0, 1fr) auto auto"
      : hasCaret || hasTrailing
        ? "minmax(0, 1fr) auto"
        : "1fr"
  const oneRowAreas =
    hasCaret && hasTrailing
      ? `"main trailing caret"`
      : hasCaret
        ? `"main caret"`
        : hasTrailing
          ? `"main trailing"`
          : `"main"`
  const twoRowAreas = hasCaret ? `"main caret" "actions actions"` : `"main" "actions"`

  return (
    <Box
      {...itemDetailListItemFrameProps}
      display="grid"
      opacity={opacity}
      alignItems="center"
      gap={0}
      columnGap={4}
      rowGap={3}
      data-inventory-item-id={inventoryItemId}
      gridTemplateColumns={
        stackOnMobile ? { base: hasCaret ? "1fr auto" : "1fr", md: oneRowColumns } : oneRowColumns
      }
      gridTemplateAreas={stackOnMobile ? { base: twoRowAreas, md: oneRowAreas } : oneRowAreas}
    >
      <HStack gridArea="main" minW={0} align="center" gap={4} {...clickable}>
        <Box flexShrink={0}>{artwork}</Box>
        <VStack align="start" gap={0} flex="1" minW={0}>
          <HStack gap={2} flexWrap="wrap">
            <Text fontWeight="medium">{name}</Text>
            {titleAddon}
          </HStack>
          {subtitle ? (
            <Text fontSize="xs" color="fg.muted" lineClamp={1}>
              {subtitle}
            </Text>
          ) : null}
          {description ? (
            <LinkifiedText fontSize="xs" color="fg.muted">
              {description}
            </LinkifiedText>
          ) : null}
        </VStack>
      </HStack>
      {trailing ? (
        <Box
          gridArea={{ base: stackOnMobile ? "actions" : "trailing", md: "trailing" }}
          w={{ base: stackOnMobile ? "full" : undefined, md: "auto" }}
          minW={0}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {trailing}
        </Box>
      ) : null}
      {onOpen ? (
        <Box gridArea="caret" flexShrink={0}>
          <ItemDetailRowCaret onClick={onOpen} />
        </Box>
      ) : null}
    </Box>
  )
}
