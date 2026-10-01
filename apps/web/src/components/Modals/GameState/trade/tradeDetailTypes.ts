import type { MediaCondition } from "@repo/types"

export type TradeItemDef = {
  name?: string
  imageUrl?: string
  shortId?: string
  model?: string
  icon?: string
  artworkFrame?: string
  slotPool?: string
  mediaFormat?: string
  condition?: MediaCondition
}
