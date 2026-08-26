import { createActor } from "xstate"
import { gameStateTradesGiftsAttentionMachine } from "../machines/gameStateTradesGiftsAttentionMachine"

export const gameStateTradesGiftsAttentionActor = createActor(
  gameStateTradesGiftsAttentionMachine,
).start()

export function markTradesGiftsTabUnseen(): void {
  gameStateTradesGiftsAttentionActor.send({ type: "MARK_UNSEEN" })
}

export function markTradesGiftsTabViewed(): void {
  gameStateTradesGiftsAttentionActor.send({ type: "TAB_VIEWED" })
}

export function resetTradesGiftsTabAttention(): void {
  gameStateTradesGiftsAttentionActor.send({ type: "RESET" })
}
