import { Tag, TagRootProps, type ConditionalValue } from "@chakra-ui/react"
import { MEDIA_CONDITION_LABELS, type MediaCondition } from "@repo/types"

/** Theme-extended tag size (`tagRecipe` adds `xs`). */
type MediaConditionTagSize = "xs" | "sm" | "md" | "lg" | "xl"

const CONDITION_PALETTE: Record<MediaCondition, string> = {
  mint: "green",
  good: "yellow",
  poor: "red",
}

type MediaConditionTagProps = {
  condition: MediaCondition
  size?: ConditionalValue<MediaConditionTagSize>
} & Omit<TagRootProps, "colorPalette" | "size">

export function MediaConditionTag({
  condition,
  size = "sm",
  ...props
}: MediaConditionTagProps) {
  return (
    <Tag.Root
      colorPalette={CONDITION_PALETTE[condition]}
      variant="subtle"
      size={size as TagRootProps["size"]}
      {...props}
    >
      <Tag.Label>{MEDIA_CONDITION_LABELS[condition]}</Tag.Label>
    </Tag.Root>
  )
}
