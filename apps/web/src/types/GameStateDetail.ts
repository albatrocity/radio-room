/** One frame on a Game State tab stack (ADR 0104 / 0106). */
export type GameStateItemDetailFrame = {
  kind: "item"
  shortId: string
  title: string
  source: "inventory" | "shop"
  definitionId?: string
  inventoryItemId?: string
  mediaKey?: string
  shopOfferId?: number
}

export type GameStateTradeDetailFrame = {
  kind: "trade"
  tradeId: string
  title: string
}

export type GameStateDetailFrame = GameStateItemDetailFrame | GameStateTradeDetailFrame

export function detailFrameTitle(frame: GameStateDetailFrame): string {
  return frame.title
}

export function isItemDetailFrame(
  frame: GameStateDetailFrame,
): frame is GameStateItemDetailFrame {
  return frame.kind === "item"
}

export function isTradeDetailFrame(
  frame: GameStateDetailFrame,
): frame is GameStateTradeDetailFrame {
  return frame.kind === "trade"
}
