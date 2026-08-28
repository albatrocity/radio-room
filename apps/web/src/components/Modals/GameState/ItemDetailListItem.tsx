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
  opacity?: number
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
  opacity,
}: Props) {
  const clickable = itemDetailClickableProps({
    detailView: onOpen ? { actionLabel: openLabel } : undefined,
    name,
    onOpen,
  })

  return (
    <HStack {...itemDetailListItemFrameProps} opacity={opacity}>
      <HStack flex="1" minW={0} align="center" gap={4} {...clickable}>
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
          flexShrink={0}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {trailing}
        </Box>
      ) : null}
      {onOpen ? <ItemDetailRowCaret onClick={onOpen} /> : null}
    </HStack>
  )
}
