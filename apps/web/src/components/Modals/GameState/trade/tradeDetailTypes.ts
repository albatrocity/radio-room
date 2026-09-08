import type { MediaCondition } from "@repo/types"

export type TradeItemDef = {
  name?: string
  imageUrl?: string
  icon?: string
  artworkFrame?: string
  slotPool?: string
  mediaFormat?: string
  condition?: MediaCondition
}
