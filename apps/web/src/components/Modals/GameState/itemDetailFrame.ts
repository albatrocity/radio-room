import type { ItemDetailView } from "@repo/types"
import type { GameStateDetailFrame } from "../../../types/GameStateDetail"

/**
 * Frame for one item, from whichever surface it was opened on (ADR 0104).
 * `source` and the id fields differ per surface, so callers pass them
 * explicitly rather than the builder inferring them.
 */
export function buildItemDetailFrame(params: {
  shortId: string
  title: string
  source: GameStateDetailFrame["source"]
  detailView: ItemDetailView
  definitionId?: string
  inventoryItemId?: string
  shopOfferId?: number
}): GameStateDetailFrame {
  const { shortId, title, source, detailView, definitionId, inventoryItemId, shopOfferId } = params
  return {
    kind: "item",
    shortId,
    title,
    source,
    ...(definitionId != null ? { definitionId } : {}),
    ...(inventoryItemId != null ? { inventoryItemId } : {}),
    ...(shopOfferId != null ? { shopOfferId } : {}),
    // Only the track-list layout fetches tracks, and it keys that fetch off
    // `mediaKey` — other layouts must not carry one.
    ...(detailView.layout === "trackList" ? { mediaKey: shortId } : {}),
  }
}
