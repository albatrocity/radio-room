import { Box, Circle, Float, HStack, Text } from "@chakra-ui/react"
import ItemArtwork from "../../../ItemArtwork"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../../artworkFrames/frameStyles"
import { OFFER_ARTWORK_SIZE, PICKER_ARTWORK_SIZE } from "./tradeDetailConstants"
import type { TradeItemDef } from "./tradeDetailTypes"

export function TradeItemRow({
  name,
  quantity,
  def,
  compact = false,
  onActivate,
  activateLabel,
}: {
  name: string
  quantity: number
  def?: TradeItemDef
  compact?: boolean
  onActivate?: () => void
  activateLabel?: string
}) {
  const boxSize = compact
    ? PICKER_ARTWORK_SIZE
    : def?.slotPool === "collection"
      ? FRAMED_ARTWORK_BOX_SIZE
      : OFFER_ARTWORK_SIZE

  const artwork = compact ? (
    <Box w={PICKER_ARTWORK_SIZE} flexShrink={0}>
      <ItemArtwork
        imageUrl={def?.imageUrl}
        icon={def?.icon as never}
        artworkFrame={def?.artworkFrame as never}
        size="feature"
        boxSize={PICKER_ARTWORK_SIZE}
        alt={name}
        interactive={false}
      />
    </Box>
  ) : (
    <ItemArtwork
      imageUrl={def?.imageUrl}
      icon={def?.icon as never}
      artworkFrame={def?.artworkFrame as never}
      boxSize={boxSize}
      alt={name}
      interactive={false}
    />
  )

  const content = (
    <>
      {artwork}
      <Text fontSize={compact ? "xs" : "sm"} flex="1" minW={0} truncate lineHeight="short">
        {name}
      </Text>
    </>
  )

  const qtyBadge =
    quantity > 1 ? (
      <Float placement="top-start">
        <Circle
          size="5"
          bg="fg"
          color="bg"
          fontSize="2xs"
          fontWeight="semibold"
          pointerEvents="none"
        >
          {quantity}
        </Circle>
      </Float>
    ) : null

  const frame = {
    position: "relative" as const,
    borderWidth: "1px" as const,
    borderRadius: "md" as const,
    p: compact ? 1.5 : 2,
    gap: compact ? 1.5 : 2,
    w: compact ? "auto" : ("full" as const),
    minW: compact ? "8rem" : 0,
    maxW: compact ? "11rem" : undefined,
    h: compact ? "full" : undefined,
    flexShrink: compact ? 0 : undefined,
    align: "center" as const,
    overflow: compact ? "hidden" : undefined,
  }

  if (onActivate) {
    return (
      <HStack
        role="button"
        tabIndex={0}
        aria-label={activateLabel}
        onClick={onActivate}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          onActivate()
        }}
        cursor="pointer"
        _hover={{ bg: "bg.muted" }}
        {...frame}
      >
        {qtyBadge}
        {content}
      </HStack>
    )
  }

  return (
    <HStack {...frame}>
      {qtyBadge}
      {content}
    </HStack>
  )
}
