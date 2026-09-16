import { Tag, TagRootProps, type ConditionalValue } from "@chakra-ui/react"
import { formatPunchCount, type PunchCountNoun } from "@repo/game-logic"

type TagSize = "xs" | "sm" | "md" | "lg" | "xl"

type TourPunchCountTagProps = {
  count: number
  noun: PunchCountNoun
  nextCoins?: number
  size?: ConditionalValue<TagSize>
} & Omit<TagRootProps, "colorPalette" | "size">

export function TourPunchCountTag({
  count,
  noun,
  nextCoins,
  size = "sm",
  ...props
}: TourPunchCountTagProps) {
  const label =
    count <= 0 && nextCoins != null
      ? `${formatPunchCount(count, noun)} · next +${nextCoins}`
      : formatPunchCount(count, noun)
  return (
    <Tag.Root
      colorPalette="purple"
      variant="subtle"
      size={size as TagRootProps["size"]}
      {...props}
    >
      <Tag.Label>{label}</Tag.Label>
    </Tag.Root>
  )
}
