/** One frame on a Game State tab stack (ADR 0104). */
export type GameStateDetailFrame = {
  kind: "item"
  shortId: string
  title: string
  source: "inventory" | "shop"
  definitionId?: string
  inventoryItemId?: string
  mediaKey?: string
  shopOfferId?: number
}
