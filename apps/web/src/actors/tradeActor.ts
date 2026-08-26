import { createActor } from "xstate"
import type { TradeSession } from "@repo/types"
import { tradeMachine } from "../machines/tradeMachine"

export const tradeActor = createActor(tradeMachine).start()

export function activateTrade(trade?: TradeSession | null) {
  tradeActor.send({ type: "ACTIVATE", trade: trade ?? null })
}

export function deactivateTrade() {
  tradeActor.send({ type: "DEACTIVATE" })
}
