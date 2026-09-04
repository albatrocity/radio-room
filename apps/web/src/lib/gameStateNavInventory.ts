/**
 * Inventory → Game State nav notices (stale item detail after convert/sell/gift).
 * Wired from `gameStateNavActor` at module load so game-state code need not import nav.
 */

export type GameStateNavInventoryNotice =
  | { type: "drop"; itemId: string }
  | { type: "held"; itemIds: readonly string[] }

type Sink = (notice: GameStateNavInventoryNotice) => void

let sink: Sink | null = null

export function bindGameStateNavInventorySink(next: Sink | null): void {
  sink = next
}

export function notifyGameStateNavInventory(notice: GameStateNavInventoryNotice): void {
  sink?.(notice)
}
