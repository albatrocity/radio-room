import type { TradeSession, UserGameStatePayload } from "@repo/types"

export type GameStateNavSessionSnapshot = {
  allowTrading: boolean
  activeTrade: TradeSession | null
}

const emptySnapshot = (): GameStateNavSessionSnapshot => ({
  allowTrading: false,
  activeTrade: null,
})

export function sessionSnapshotFromPayload(
  payload: UserGameStatePayload | null | undefined,
): GameStateNavSessionSnapshot {
  if (!payload) return emptySnapshot()
  return {
    allowTrading: payload.session?.config?.allowTrading === true,
    activeTrade: payload.activeTrade ?? null,
  }
}

type Sink = (snapshot: GameStateNavSessionSnapshot) => void

let sink: Sink | null = null

/** Wired from `gameStateNavActor` at module load so payload code need not import nav. */
export function bindGameStateNavSessionSink(next: Sink | null): void {
  sink = next
}

export function notifyGameStateNavSession(snapshot: GameStateNavSessionSnapshot): void {
  sink?.(snapshot)
}
